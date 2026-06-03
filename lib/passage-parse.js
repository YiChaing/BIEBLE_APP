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
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  let n = 0;
  if (str.includes("百")) {
    const [a, rest] = str.split("百");
    n += (CN_DIGIT[a] || (a === "" ? 1 : 0)) * 100;
    str = rest || "";
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

function parseChapSec(part) {
  const m = part.match(/^([一二三四五六七八九十百零○\d]+)(.*)$/);
  if (!m) return { chap: 1, sec: 1 };
  const chap = chineseToNumber(m[1]);
  const secPart = m[2].replace(/[～~\-–]/g, "").trim();
  const sec = secPart ? chineseToNumber(secPart) : 1;
  return { chap, sec };
}

function parseEndPart(endPart, startChap) {
  const m = endPart.match(/^([一二三四五六七八九十百零○\d]+)(.*)$/);
  if (!m) return { chap: startChap, sec: chineseToNumber(endPart) || 1 };
  const first = m[1];
  const rest = m[2];
  const firstNum = chineseToNumber(first);
  if (rest) {
    return { chap: firstNum, sec: chineseToNumber(rest) || 1 };
  }
  if (first.length === 1 && CN_DIGIT[first] !== undefined && firstNum <= 9) {
    return { chap: startChap, sec: firstNum };
  }
  return { chap: firstNum, sec: 150 };
}

/**
 * 解析 DayByWord 原始範圍，如「创一1～二25」
 */
function parseRawPassage(raw) {
  if (!raw) return null;
  const text = raw.replace(/～|~/g, "～").trim();
  let book = "";
  let rest = text;
  for (const key of BOOK_KEYS) {
    if (text.startsWith(key)) {
      book = key;
      rest = text.slice(key.length);
      break;
    }
  }
  if (!book) return null;

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

module.exports = { parseRawPassage, chineseToNumber };
