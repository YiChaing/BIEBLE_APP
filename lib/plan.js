const fs = require("fs");
const path = require("path");
const { formatPassageDisplay } = require("./passage-parse");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PLAN_FILE = path.join(DATA_DIR, "reading-plan-365.json");
const PLAN_URL = "https://daybyword.org/zh-CN/plans/read-bible-in-a-year";
const CACHE_MS = 24 * 60 * 60 * 1000;

/** 讀經計劃第 1 天 = 此日期（含） */
const PLAN_START_DATE = process.env.PLAN_START_DATE || "2026-06-05";

let memoryPlan = null;

function parseDateOnly(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(start, end) {
  const a = parseDateOnly(formatDateOnly(start));
  const b = parseDateOnly(formatDateOnly(end));
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function getPlanStartDate() {
  return parseDateOnly(PLAN_START_DATE);
}

function getPlanDayForDate(date = new Date()) {
  const start = getPlanStartDate();
  const diff = daysBetween(start, date);
  if (diff < 0) return 1;
  return Math.min(diff + 1, 365);
}

function getDateForPlanDay(planDay) {
  const start = getPlanStartDate();
  const d = new Date(start);
  d.setDate(d.getDate() + planDay - 1);
  return d;
}

function getCalendarPlanDay() {
  return getPlanDayForDate(new Date());
}

function getPlanBounds() {
  const start = getPlanStartDate();
  const end = new Date(start);
  end.setDate(end.getDate() + 364);
  return {
    startDate: PLAN_START_DATE,
    endDate: formatDateOnly(end),
    totalDays: 365,
  };
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
      oldTestament: formatPassageDisplay(ot),
      newTestament: formatPassageDisplay(nt),
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
    planStartDate: PLAN_START_DATE,
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
      memoryPlan = { ...disk, planStartDate: disk.planStartDate || PLAN_START_DATE };
      return memoryPlan;
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
  const entry = plan.days.find((d) => d.day === day) || null;
  if (!entry) return null;
  return {
    ...entry,
    oldTestament: formatPassageDisplay(entry.oldTestamentRaw),
    newTestament: formatPassageDisplay(entry.newTestamentRaw),
  };
}

function resolvePlanDay(input) {
  if (input?.planDay) {
    const n = Number(input.planDay);
    if (n >= 1 && n <= 365) return n;
  }
  if (input?.date) {
    return getPlanDayForDate(parseDateOnly(input.date));
  }
  return getCalendarPlanDay();
}

module.exports = {
  getReadingPlan,
  getPlanDayForDate,
  getDateForPlanDay,
  getCalendarPlanDay,
  getPlanBounds,
  getDayEntry,
  resolvePlanDay,
  formatDateOnly,
  PLAN_START_DATE,
  PLAN_URL,
};
