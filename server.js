const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { isConfigured, getPublicConfig } = require("./lib/firebase-admin");
const { getUserByToken } = require("./lib/auth");
const {
  getUsers,
  getCheckins,
  findCheckinByUserPlanDay,
  getUserCheckinPlanDays,
  addCheckin,
} = require("./lib/firestore");
const {
  getReadingPlan,
  getPlanDayForDate,
  getDateForPlanDay,
  getCalendarPlanDay,
  getPlanBounds,
  getDayEntry,
  resolvePlanDay,
  formatDateOnly,
  PLAN_START_DATE,
} = require("./lib/plan");
const { getFullScriptureForDay } = require("./lib/scripture");
const {
  monthKey,
  buildLeaderboard,
  getTop3,
  archivePastMonths,
  getAllProgress,
  getMonthlyWinners,
  ensureMonthlyWinnersRecorded,
  getSuggestedPlanDay,
} = require("./lib/stats");

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function getQueryParams(req) {
  return new URL(req.url, `http://localhost:${PORT}`).searchParams;
}

async function handleApi(req, res, pathname) {
  const token = getToken(req);
  let user = null;
  let authError = null;
  if (token) {
    try {
      user = await getUserByToken(token);
    } catch (e) {
      authError = e.message;
      console.error("Auth error:", e.message);
      if (pathname === "/api/auth/me") {
        return json(res, 401, { error: e.message, code: e.code });
      }
    }
  }

  const qs = getQueryParams(req);

  if (pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, {
      ok: true,
      name: "聖經追蹤器",
      firebase: isConfigured(),
      planStartDate: PLAN_START_DATE,
    });
  }

  if (pathname === "/api/firebase-config" && req.method === "GET") {
    const config = getPublicConfig();
    if (!config.apiKey || !config.projectId) {
      return json(res, 503, { error: "Firebase 尚未設定" });
    }
    return json(res, 200, config);
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    if (!user) {
      return json(res, 401, {
        error: authError || (token ? "登入驗證失敗" : "請先使用 Gmail 登入"),
      });
    }
    return json(res, 200, { user });
  }

  if (pathname === "/api/plan-info" && req.method === "GET") {
    const bounds = getPlanBounds();
    const calendarPlanDay = getCalendarPlanDay();
    return json(res, 200, {
      ...bounds,
      calendarPlanDay,
      calendarDate: formatDateOnly(new Date()),
    });
  }

  if (pathname === "/api/day" && req.method === "GET") {
    try {
      const plan = await getReadingPlan();
      const planDay = resolvePlanDay({
        date: qs.get("date"),
        planDay: qs.get("planDay"),
      });
      const date = formatDateOnly(getDateForPlanDay(planDay));
      const entry = getDayEntry(plan, planDay);
      const calendarPlanDay = getCalendarPlanDay();

      let checked = false;
      let mySuggestedPlanDay = null;
      if (user) {
        const existing = await findCheckinByUserPlanDay(user.id, planDay);
        checked = Boolean(existing);
        const days = await getUserCheckinPlanDays(user.id);
        mySuggestedPlanDay = getSuggestedPlanDay(days, calendarPlanDay);
      }

      return json(res, 200, {
        planDay,
        date,
        entry,
        calendarPlanDay,
        calendarDate: formatDateOnly(new Date()),
        planStartDate: PLAN_START_DATE,
        checked,
        mySuggestedPlanDay,
        isToday: planDay === calendarPlanDay,
        isFuture: planDay > calendarPlanDay,
      });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (pathname === "/api/scripture" && req.method === "GET") {
    try {
      const plan = await getReadingPlan();
      const planDay = resolvePlanDay({
        date: qs.get("date"),
        planDay: qs.get("planDay"),
      });
      const entry = getDayEntry(plan, planDay);
      if (!entry) return json(res, 404, { error: "找不到該日讀經" });
      const scripture = await getFullScriptureForDay(entry);
      return json(res, 200, { planDay, scripture });
    } catch (e) {
      return json(res, 500, { error: "無法載入經文：" + e.message });
    }
  }

  if (pathname === "/api/checkin" && req.method === "POST") {
    if (!user) {
      return json(res, 401, { error: "請先使用 Gmail 登入" });
    }
    try {
      const body = await parseBody(req);
      const plan = await getReadingPlan();
      const planDay = resolvePlanDay({
        date: body.date,
        planDay: body.planDay,
      });
      const exists = await findCheckinByUserPlanDay(user.id, planDay);
      if (exists) {
        return json(res, 409, { error: `第 ${planDay} 天已完成打卡` });
      }
      const entry = getDayEntry(plan, planDay);
      const record = {
        userId: user.id,
        date: formatDateOnly(getDateForPlanDay(planDay)),
        checkinDate: formatDateOnly(new Date()),
        planDay,
        oldTestament: entry?.oldTestament || "",
        newTestament: entry?.newTestament || "",
        createdAt: new Date().toISOString(),
      };
      const saved = await addCheckin(record);
      return json(res, 201, { ok: true, checkin: saved });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (pathname === "/api/dashboard" && req.method === "GET") {
    try {
      await archivePastMonths();
      const plan = await getReadingPlan();
      const calendarPlanDay = getCalendarPlanDay();
      const users = await getUsers();
      const checkins = await getCheckins();
      const ym = monthKey();
      const leaderboard = buildLeaderboard(users, checkins, ym);
      const top3 = getTop3(leaderboard);
      const progress = getAllProgress(users, checkins, calendarPlanDay);
      const winners = await getMonthlyWinners();
      const prevMonth = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return monthKey(d);
      })();
      await ensureMonthlyWinnersRecorded(prevMonth);

      let mySuggestedPlanDay = null;
      if (user) {
        const days = await getUserCheckinPlanDays(user.id);
        mySuggestedPlanDay = getSuggestedPlanDay(days, calendarPlanDay);
      }

      return json(res, 200, {
        calendarPlanDay,
        calendarDate: formatDateOnly(new Date()),
        planStartDate: PLAN_START_DATE,
        planBounds: getPlanBounds(),
        planMeta: {
          name: plan.name,
          updatedAt: plan.updatedAt,
          sourceUrl: plan.sourceUrl,
        },
        leaderboard,
        monthlyTop3: top3,
        allProgress: progress,
        monthlyWinners: winners.slice(-12).reverse(),
        currentUser: user || null,
        mySuggestedPlanDay,
      });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  json(res, 404, { error: "找不到 API" });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(PUBLIC, filePath);
  if (!full.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end();
  }
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    if (pathname !== "/" && !pathname.includes(".")) {
      const index = path.join(PUBLIC, "index.html");
      if (fs.existsSync(index)) {
        const html = fs.readFileSync(index);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
      }
    }
    res.writeHead(404);
    return res.end("Not Found");
  }
  const ext = path.extname(full);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (pathname.startsWith("/api/")) {
    if (!isConfigured()) {
      return json(res, 503, {
        error: "Firebase 尚未設定，請設定 FIREBASE_* 環境變數",
      });
    }
    return handleApi(req, res, pathname);
  }
  serveStatic(req, res, pathname);
});

async function bootstrap() {
  if (!isConfigured()) {
    console.error("\n❌ 請設定 Firebase 環境變數，參考 .env.example 與 FIREBASE_SETUP.md\n");
    process.exit(1);
  }

  try {
    console.log("正在同步 365 天讀經計劃…");
    await getReadingPlan();
    console.log(`讀經計劃已就緒（第 1 天：${PLAN_START_DATE}）`);
  } catch (e) {
    console.warn("讀經計劃載入警告:", e.message);
  }

  server.listen(PORT, HOST, () => {
    console.log(`\n📖 聖經追蹤器已啟動（Firebase）`);
    console.log(`   監聽 ${HOST}:${PORT}\n`);
  });
}

bootstrap();
