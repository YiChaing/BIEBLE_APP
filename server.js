const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { isConfigured, getPublicConfig } = require("./lib/firebase-admin");
const { getUserByToken } = require("./lib/auth");
const {
  getUsers,
  getCheckins,
  findCheckinToday,
  addCheckin,
} = require("./lib/firestore");
const { getReadingPlan, getPlanDayForDate, getDayEntry } = require("./lib/plan");
const {
  monthKey,
  buildLeaderboard,
  getTop3,
  archivePastMonths,
  getAllProgress,
  getMonthlyWinners,
  ensureMonthlyWinnersRecorded,
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

async function handleApi(req, res, pathname) {
  const token = getToken(req);
  let user = null;
  if (token) {
    try {
      user = await getUserByToken(token);
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, {
      ok: true,
      name: "聖經追蹤器",
      firebase: isConfigured(),
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
    if (!user) return json(res, 401, { error: "請先登入" });
    return json(res, 200, { user });
  }

  if (pathname === "/api/reading-plan" && req.method === "GET") {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const refresh = url.searchParams.get("refresh") === "1";
      const plan = await getReadingPlan(refresh);
      const planDay = getPlanDayForDate();
      const today = getDayEntry(plan, planDay);
      return json(res, 200, {
        planDay,
        today,
        meta: {
          name: plan.name,
          totalDays: plan.totalDays,
          updatedAt: plan.updatedAt,
          sourceUrl: plan.sourceUrl,
        },
      });
    } catch (e) {
      return json(res, 500, { error: "無法載入讀經計劃：" + e.message });
    }
  }

  if (pathname === "/api/checkin" && req.method === "POST") {
    if (!user) {
      return json(res, 401, { error: "請先使用 Gmail 登入" });
    }
    try {
      const plan = await getReadingPlan();
      const planDay = getPlanDayForDate();
      const todayStr = new Date().toISOString().slice(0, 10);
      const exists = await findCheckinToday(user.id, todayStr);
      if (exists) {
        return json(res, 409, { error: "今日已完成打卡" });
      }
      const entry = getDayEntry(plan, planDay);
      const record = {
        userId: user.id,
        date: todayStr,
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
      const planDay = getPlanDayForDate();
      const todayEntry = getDayEntry(plan, planDay);
      const users = await getUsers();
      const checkins = await getCheckins();
      const ym = monthKey();
      const leaderboard = buildLeaderboard(users, checkins, ym);
      const top3 = getTop3(leaderboard);
      const progress = getAllProgress(users, checkins, planDay);
      const winners = await getMonthlyWinners();
      const prevMonth = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return monthKey(d);
      })();
      await ensureMonthlyWinnersRecorded(prevMonth);

      return json(res, 200, {
        planDay,
        today: todayEntry,
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
    console.log("讀經計劃已就緒");
  } catch (e) {
    console.warn("讀經計劃載入警告:", e.message);
  }

  server.listen(PORT, HOST, () => {
    console.log(`\n📖 聖經追蹤器已啟動（Firebase）`);
    console.log(`   監聽 ${HOST}:${PORT}\n`);
  });
}

bootstrap();
