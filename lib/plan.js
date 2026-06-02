const fs = require("fs");
const path = require("path");
const { toTraditionalPassage } = require("./book-names");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PLAN_FILE = path.join(DATA_DIR, "reading-plan-365.json");
const PLAN_URL = "https://daybyword.org/zh-CN/plans/read-bible-in-a-year";
const CACHE_MS = 24 * 60 * 60 * 1000;

let memoryPlan = null;

function getPlanDayForDate(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return Math.min(Math.max(dayOfYear, 1), 365);
}

function loadPlanFromDisk() {
  if (!fs.existsSync(PLAN_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PLAN_FILE, "utf8"));
  } catch {
    return null;
  }
}

function cleanPassageRaw(raw) {
  return raw.replace(/^!--\s*-->\s*/, "").replace(/^📖\s*/, "").trim();
}

function parseDayByWordHtml(html) {
  const days = [];
  const re =
    /📖[\s\S]*?>\s*([^<]+)<\/div>\s*<div[^>]*>\s*📖[\s\S]*?>\s*([^<]+)<\/div>/g;
  let m;
  let dayNum = 1;
  while ((m = re.exec(html)) && dayNum <= 365) {
    const ot = cleanPassageRaw(m[1]);
    const nt = cleanPassageRaw(m[2]);
    days.push({
      day: dayNum,
      oldTestamentRaw: ot,
      newTestamentRaw: nt,
      oldTestament: toTraditionalPassage(ot),
      newTestament: toTraditionalPassage(nt),
    });
    dayNum++;
  }
  return days;
}

async function fetchPlanFromWeb() {
  const res = await fetch(PLAN_URL, {
    headers: { "User-Agent": "BibleTracker/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const days = parseDayByWordHtml(html);
  if (days.length < 300) throw new Error(`僅解析到 ${days.length} 天`);
  const payload = {
    name: "一年讀一遍聖經",
    description: "每日舊約與新約經文",
    totalDays: 365,
    sourceUrl: PLAN_URL,
    updatedAt: new Date().toISOString(),
    days,
  };
  fs.mkdirSync(path.dirname(PLAN_FILE), { recursive: true });
  fs.writeFileSync(PLAN_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function getReadingPlan(forceRefresh = false) {
  if (memoryPlan && !forceRefresh) {
    const age = Date.now() - new Date(memoryPlan.updatedAt).getTime();
    if (age < CACHE_MS) return memoryPlan;
  }

  const disk = loadPlanFromDisk();
  if (disk && !forceRefresh) {
    const age = Date.now() - new Date(disk.updatedAt || 0).getTime();
    if (age < CACHE_MS || !global.fetch) {
      memoryPlan = disk;
      return disk;
    }
  }

  try {
    memoryPlan = await fetchPlanFromWeb();
    return memoryPlan;
  } catch (err) {
    if (disk) {
      memoryPlan = disk;
      return disk;
    }
    throw err;
  }
}

function getDayEntry(plan, day) {
  return plan.days.find((d) => d.day === day) || null;
}

module.exports = {
  getReadingPlan,
  getPlanDayForDate,
  getDayEntry,
  PLAN_URL,
};
