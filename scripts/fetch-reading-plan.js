/**
 * 從 DayByWord 抓取「一年讀一遍聖經」365 天計劃並存成 JSON
 * 執行：node scripts/fetch-reading-plan.js
 */
const fs = require("fs");
const path = require("path");
const { formatPassageDisplay } = require("../lib/passage-parse");

const PLAN_URL = "https://daybyword.org/zh-CN/plans/read-bible-in-a-year";
const OUT = path.join(__dirname, "..", "data", "reading-plan-365.json");

async function fetchPlan() {
  const res = await fetch(PLAN_URL, {
    headers: { "User-Agent": "BibleTracker/1.0 (educational)" },
  });
  if (!res.ok) throw new Error(`抓取失敗: ${res.status}`);
  const html = await res.text();
  return parseDayByWordHtml(html);
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
      source: "daybyword.org",
      fetchedAt: new Date().toISOString(),
    });
    dayNum++;
  }
  if (days.length < 300) {
    throw new Error(`解析結果僅 ${days.length} 天，可能頁面格式已變更`);
  }
  return days;
}

async function main() {
  console.log("正在從網路抓取 365 天讀經計劃…");
  const days = await fetchPlan();
  const payload = {
    name: "一年讀一遍聖經",
    description: "每日舊約與新約經文（資料來源：DayByWord）",
    totalDays: 365,
    sourceUrl: PLAN_URL,
    updatedAt: new Date().toISOString(),
    days,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`已儲存 ${days.length} 天至 ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
