// AI 用量小组件（Scriptable 免费版可用）
// 数据来源：GitHub 上的 usage.json（由管家抓取真实用量后更新，文件里只有百分比和重置时间，无任何账号凭证）
// 显示：剩余额度百分比 + 进度条 + 重置时间 + 剩余天数；剩余 <25% 标黄，<10% 标红

const DATA_URL = "https://raw.githubusercontent.com/xiong1915/xiong1915/main/ai-usage.json";
const CACHE_NAME = "ai-usage-cache.json";

const GREEN = new Color("#30d158");
const YELLOW = Color.dynamic(new Color("#b58900"), new Color("#ffd60a"));
const RED = new Color("#ff453a");
const GREY = new Color("#8e8e93");
const TRACK = new Color("#8e8e93", 0.25);

function colorFor(remaining) {
  if (remaining < 10) return RED;
  if (remaining < 25) return YELLOW;
  return GREEN;
}

async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 10;
    const json = await req.loadJSON();
    fm.writeString(cachePath, JSON.stringify(json));
    return json;
  } catch (e) {
    // 拉不到就用上次缓存，避免组件空白
    if (fm.fileExists(cachePath)) {
      return JSON.parse(fm.readString(cachePath));
    }
    return null;
  }
}

function fmtDate(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function resetText(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  let tail;
  if (diff <= 0) {
    tail = "已到重置时间";
  } else if (diff >= 86400000) {
    tail = `剩 ${Math.ceil(diff / 86400000)} 天`;
  } else {
    tail = `剩 ${Math.max(1, Math.round(diff / 3600000))} 小时`;
  }
  return `${fmtDate(iso)} 重置 · ${tail}`;
}

function barImage(percent, color, width, height) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const r = height / 2;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, height), r);
  dc.addPath(track);
  dc.setFillColor(TRACK);
  dc.fillPath();
  if (percent > 0) {
    const w = Math.max(height, Math.round(width * Math.min(100, percent) / 100));
    const fill = new Path();
    fill.addRoundedRect(new Rect(0, 0, w, height), r);
    dc.addPath(fill);
    dc.setFillColor(color);
    dc.fillPath();
  }
  return dc.getImage();
}

function addService(widget, svc, barWidth) {
  const isAvail = svc.available !== false && typeof svc.remaining === "number";
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const name = row.addText(svc.name);
  name.font = Font.boldSystemFont(13);
  row.addSpacer();
  if (isAvail) {
    const pct = row.addText(`剩余 ${svc.remaining}%`);
    pct.font = Font.boldSystemFont(13);
    pct.textColor = colorFor(svc.remaining);
  } else {
    const na = row.addText("暂无数据");
    na.font = Font.systemFont(12);
    na.textColor = GREY;
  }
  if (isAvail) {
    widget.addSpacer(3);
    const img = widget.addImage(barImage(svc.remaining, colorFor(svc.remaining), barWidth, 6));
    img.imageSize = new Size(barWidth, 6);
    widget.addSpacer(3);
    let subText = svc.label || "";
    if (svc.resetAt) subText += ` · ${resetText(svc.resetAt)}`;
    else if (svc.detail) subText += ` · ${svc.detail}`;
    const sub = widget.addText(subText);
    sub.font = Font.systemFont(10);
    sub.textColor = GREY;
  } else if (svc.reason) {
    widget.addSpacer(2);
    const sub = widget.addText(svc.reason);
    sub.font = Font.systemFont(10);
    sub.textColor = GREY;
  }
}

const data = await loadData();
const widget = new ListWidget();
widget.setPadding(12, 14, 12, 14);
widget.backgroundColor = Color.dynamic(new Color("#ffffff"), new Color("#1c1c1e"));

const family = config.widgetFamily || "medium";
const barWidth = family === "small" ? 120 : 300;

const head = widget.addStack();
head.layoutHorizontally();
head.centerAlignContent();
const title = head.addText("AI 用量");
title.font = Font.boldSystemFont(15);
head.addSpacer();
if (data && data.updatedAt) {
  const upd = head.addText("更新 " + fmtDate(data.updatedAt));
  upd.font = Font.systemFont(10);
  upd.textColor = GREY;
}
widget.addSpacer(8);

if (!data) {
  const t = widget.addText("数据加载失败，检查网络后点开 Scriptable 刷新");
  t.font = Font.systemFont(12);
} else {
  const all = data.services || [];
  const avail = all.filter(s => s.available !== false && typeof s.remaining === "number");
  const unavail = all.filter(s => !(s.available !== false && typeof s.remaining === "number"));
  const shown = family === "small" ? avail.slice(0, 2) : avail;
  shown.forEach((svc, i) => {
    if (i > 0) widget.addSpacer(7);
    addService(widget, svc, barWidth);
  });
  if (family === "large") {
    unavail.forEach(svc => {
      widget.addSpacer(7);
      addService(widget, svc, barWidth);
    });
  } else if (family !== "small" && unavail.length > 0) {
    // 中号空间有限，无数据的服务合并成一行
    widget.addSpacer(8);
    const line = widget.addText(unavail.map(s => s.name).join(" · ") + "：暂无数据");
    line.font = Font.systemFont(10);
    line.textColor = GREY;
  }
}

// 向系统申请 30 分钟后刷新（实际刷新时机由 iOS 决定）
widget.refreshAfterDate = new Date(Date.now() + 1000 * 60 * 30);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === "small") {
  await widget.presentSmall();
} else {
  await widget.presentMedium();
}
Script.complete();
