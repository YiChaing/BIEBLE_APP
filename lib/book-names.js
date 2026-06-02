/** 簡體/縮寫 → 繁體書名 */
const BOOK_MAP = {
  创: "創世記",
  出: "出埃及記",
  利: "利未記",
  民: "民數記",
  申: "申命記",
  书: "約書亞記",
  士: "士師記",
  得: "路得記",
  撒上: "撒母耳記上",
  撒下: "撒母耳記下",
  王上: "列王紀上",
  王下: "列王紀下",
  代上: "歷代志上",
  代下: "歷代志下",
  拉: "以斯拉記",
  尼: "尼希米記",
  斯: "以斯帖記",
  伯: "約伯記",
  诗: "詩篇",
  箴: "箴言",
  传: "傳道書",
  歌: "雅歌",
  赛: "以賽亞書",
  耶: "耶利米書",
  哀: "耶利米哀歌",
  结: "以西結書",
  但: "但以理書",
  何: "何西阿書",
  珥: "約珥書",
  摩: "阿摩司書",
  俄: "俄巴底亞書",
  拿: "約拿書",
  弥: "彌迦書",
  鸿: "那鴻書",
  哈: "哈巴谷書",
  番: "西番雅書",
  该: "哈該書",
  亚: "撒迦利亞書",
  玛: "瑪拉基書",
  太: "馬太福音",
  可: "馬可福音",
  路: "路加福音",
  约: "約翰福音",
  徒: "使徒行傳",
  罗: "羅馬書",
  林前: "哥林多前書",
  林后: "哥林多後書",
  加: "加拉太書",
  弗: "以弗所書",
  腓: "腓立比書",
  西: "歌羅西書",
  帖前: "帖撒羅尼迦前書",
  帖后: "帖撒羅尼迦後書",
  提前: "提摩太前書",
  提后: "提摩太後書",
  多: "提多書",
  门: "腓利門書",
  来: "希伯來書",
  雅: "雅各書",
  彼前: "彼得前書",
  彼后: "彼得後書",
  约壹: "約翰一書",
  约贰: "約翰二書",
  约参: "約翰三書",
  犹: "猶大書",
  启: "啟示錄",
};

const BOOK_KEYS = Object.keys(BOOK_MAP).sort((a, b) => b.length - a.length);

function toTraditionalPassage(raw) {
  if (!raw) return "";
  let text = raw.replace(/^📖\s*/, "").trim();
  for (const key of BOOK_KEYS) {
    if (text.startsWith(key)) {
      const rest = text.slice(key.length);
      return `${BOOK_MAP[key]}${formatChapterVerses(rest)}`;
    }
  }
  return text;
}

function formatChapterVerses(rest) {
  const m = rest.match(/^([一二三四五六七八九十百○零]+)(.*)$/);
  if (!m) return rest;
  const chap = m[1];
  const verses = m[2].replace(/～/g, "–").replace(/~/g, "–");
  return ` ${arabicChapter(chap)}${verses ? " " + verses.trim() : ""}`;
}

const CN_NUM = {
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
  十: 10,
  百: 100,
};

function arabicChapter(cn) {
  if (/^\d+$/.test(cn)) return `第${cn}章`;
  let n = 0;
  if (cn.includes("十")) {
    const parts = cn.split("十");
    const tens = parts[0] === "" ? 1 : CN_NUM[parts[0]] || 0;
    const ones = parts[1] ? CN_NUM[parts[1]] || 0 : 0;
    n = tens * 10 + ones;
  } else {
    n = CN_NUM[cn] ?? 0;
  }
  return `第${n}章`;
}

module.exports = { BOOK_MAP, toTraditionalPassage };
