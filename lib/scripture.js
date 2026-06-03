const { parseRawPassage, formatPassageDisplay } = require("./passage-parse");

const FHL_QB = "https://bible.fhl.net/json/qb.php";
const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function secParam(start, end) {
  if (start === end) return String(start);
  return `${start}-${end}`;
}

async function fetchChapterVerses(book, chap, secStart, secEnd) {
  const key = `${book}-${chap}-${secStart}-${secEnd}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  const url = new URL(FHL_QB);
  url.searchParams.set("chineses", book);
  url.searchParams.set("chap", String(chap));
  url.searchParams.set("sec", secParam(secStart, secEnd));
  url.searchParams.set("version", "unv");
  url.searchParams.set("gb", "0");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "BibleTracker/1.0" },
  });
  if (!res.ok) throw new Error(`經文 API ${res.status}`);
  const json = await res.json();
  if (json.status !== "success" && json.status !== true) {
    throw new Error(json.message || "無法取得經文");
  }

  const verses = (json.record || []).map((r) => ({
    chap: r.chap,
    sec: r.sec,
    text: (r.bible_text || r.text || "").trim(),
  }));

  cache.set(key, { at: Date.now(), data: verses });
  return verses;
}

async function fetchPassageText(raw, label) {
  const parsed = parseRawPassage(raw);
  if (!parsed) {
    return { label, title: raw, verses: [], error: "無法解析經文範圍" };
  }

  const allVerses = [];
  try {
    for (const r of parsed.ranges) {
      const verses = await fetchChapterVerses(
        parsed.book,
        r.chap,
        r.secStart,
        r.secEnd
      );
      allVerses.push(...verses);
    }
  } catch (e) {
    return {
      label,
      title: formatPassageDisplay(raw),
      verses: [],
      error: e.message,
    };
  }

  return {
    label,
    title: formatPassageDisplay(raw),
    verses: allVerses,
    error: null,
  };
}

async function getFullScriptureForDay(entry) {
  if (!entry) return { oldTestament: null, newTestament: null };
  const [ot, nt] = await Promise.all([
    fetchPassageText(entry.oldTestamentRaw, "舊約"),
    fetchPassageText(entry.newTestamentRaw, "新約"),
  ]);
  return { oldTestament: ot, newTestament: nt };
}

module.exports = {
  getFullScriptureForDay,
  fetchPassageText,
};
