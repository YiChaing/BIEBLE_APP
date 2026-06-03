const { BOOK_MAP } = require("./book-names");

const BOOK_KEYS = Object.keys(BOOK_MAP).sort((a, b) => b.length - a.length);

const CN_DIGIT = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function chineseToNumber(str) {
  if (!str) return 0;
  const s = String(str).replace(/[上下]/g, "");
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let n = 0;
  if (s.includes("百")) {
    const [a, rest] = s.split("百");
    n += (CN_DIGIT[a] || (a === "" ? 1 : 0)) * 100;
    str = rest || "";
  } else {
    str = s;
  }
  if (str.includes("十")) {
    const parts = str.split("十");
    const tens = parts[0] === "" ? 1 : CN_DIGIT[parts[0]] || 0;
    const ones = parts[1] ? CN_DIGIT[parts[1]] || 0 : 0;
    n += tens * 10 + ones;
  } else if (str) {
    n += CN_DIGIT[str] || 0;
  }
  return n || 1;
}

/** 章為中文數字；節為阿拉伯數字（可含上/下） */
const CHAP_RE = /^([一二三四五六七八九十百零○]+)(.*)$/;

/** 解析章節＋節，如「一1」「十一43下」 */
function parseChapSec(part) {
  const m = part.match(CHAP_RE);
  if (!m) return { chap: 1, sec: 1, half: "" };
  const chap = chineseToNumber(m[1]);
  const tail = m[2].replace(/[～~\-–]/g, "").trim();
  const halfMatch = tail.match(/([上下])/);
  const half = halfMatch ? halfMatch[1] : "";
  const numMatch = tail.match(/(\d+)/);
  const sec = numMatch ? parseInt(numMatch[1], 10) : 1;
  return { chap, sec, half };
}

/** 解析結束範圍，如「二25」「25」「五32」 */
function parseEndPart(endPart, startChap) {
  const t = endPart.trim();
  if (/^\d+$/.test(t)) {
    return { chap: startChap, sec: parseInt(t, 10), half: "" };
  }
  const m = t.match(CHAP_RE);
  if (!m) return { chap: startChap, sec: 1, half: "" };
  const first = m[1];
  const rest = m[2];
  const firstNum = chineseToNumber(first);
  const halfMatch = rest.match(/([上下])/);
  const half = halfMatch ? halfMatch[1] : "";
  const numMatch = rest.match(/(\d+)/);
  if (numMatch) {
    return { chap: firstNum, sec: parseInt(numMatch[1], 10), half };
  }
  if (first.length === 1 && CN_DIGIT[first] !== undefined && firstNum <= 9) {
    return { chap: startChap, sec: firstNum, half };
  }
  return { chap: firstNum, sec: 150, half };
}

function chapSecLabel(chap, sec, half) {
  const halfText = half === "上" ? "（上）" : half === "下" ? "（下）" : "";
  return `第${chap}章 ${sec}節${halfText}`;
}

/**
 * 格式化顯示，如：
 * 创一1～二25 → 創世記 第1章 1節 ～ 第2章 25節
 * 太一1～25   → 馬太福音 第1章 1節 ～ 第1章 25節
 */
function formatPassageDisplay(raw) {
  const parsed = parseRawPassage(raw);
  if (!parsed) return (raw || "").trim();
  const { bookName, start, end } = parsed;
  return `${bookName} ${chapSecLabel(start.chap, start.sec, start.half)} ～ ${chapSecLabel(end.chap, end.sec, end.half)}`;
}

/**
 * 解析 DayByWord 原始範圍
 */
function parseRawPassage(raw) {
  if (!raw) return null;
  const text = raw.replace(/～|~/g, "～").trim();
  let book = "";
  for (const key of BOOK_KEYS) {
    if (text.startsWith(key)) {
      book = key;
      break;
    }
  }
  if (!book) return null;

  const rest = text.slice(book.length);
  const parts = rest.split("～");
  const start = parseChapSec(parts[0]);
  const end = parts[1] ? parseEndPart(parts[1], start.chap) : { ...start };

  const ranges = [];
  for (let c = start.chap; c <= end.chap; c++) {
    const secStart = c === start.chap ? start.sec : 1;
    const secEnd = c === end.chap ? end.sec : 150;
    ranges.push({ book, chap: c, secStart, secEnd });
  }
  return {
    book,
    bookName: BOOK_MAP[book],
    start,
    end,
    ranges,
  };
}

module.exports = {
  parseRawPassage,
  formatPassageDisplay,
  chineseToNumber,
};
