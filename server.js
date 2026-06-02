const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  registerUser,
  loginUser,
  logoutUser,
  getUserByToken,
} = require("./lib/auth");
const { getUsers, getCheckins, saveCheckins } = require("./lib/db");
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
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function setSessionCookie(res, token) {
  const maxAge = 30 * 24 * 60 * 60;
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return "session=; Path=/; HttpOnly; Max-Age=0";
}

async function handleApi(req, res, pathname) {
  const token = getToken(req);
  const user = getUserByToken(token);

  if (pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, { ok: true, name: "聖經追蹤器" });
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const result = registerUser(body);
      if (!result.ok) return json(res, 400, result);
      const login = loginUser({
        username: body.username,
        password: body.password,
      });
      return json(
        res,
        201,
        { user: login.user },
        { "Set-Cookie": setSessionCookie(res, login.token) }
      );
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const result = loginUser(body);
      if (!result.ok) return json(res, 401, result);
      return json(
        res,
        200,
        { user: result.user },
        { "Set-Cookie": setSessionCookie(res, result.token) }
      );
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    logoutUser(token);
    return json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
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
    if (!user) return json(res, 401, { error: "請先登入" });
    try {
      const plan = await getReadingPlan();
      const planDay = getPlanDayForDate();
      const todayStr = new Date().toISOString().slice(0, 10);
      const checkins = getCheckins();
      const exists = checkins.find(
        (c) =>
          c.userId === user.id && c.date === todayStr && c.planDay === planDay
      );
      if (exists) {
        return json(res, 409, { error: "今日已完成打卡" });
      }
      const entry = getDayEntry(plan, planDay);
      const record = {
        id: require("crypto").randomUUID(),
        userId: user.id,
        date: todayStr,
        planDay,
        oldTestament: entry?.oldTestament || "",
        newTestament: entry?.newTestament || "",
        createdAt: new Date().toISOString(),
      };
      checkins.push(record);
      saveCheckins(checkins);
      return json(res, 201, { ok: true, checkin: record });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (pathname === "/api/dashboard" && req.method === "GET") {
    try {
      archivePastMonths();
      const plan = await getReadingPlan();
      const planDay = getPlanDayForDate();
      const todayEntry = getDayEntry(plan, planDay);
      const users = getUsers();
      const checkins = getCheckins();
      const ym = monthKey();
      const leaderboard = buildLeaderboard(users, checkins, ym);
      const top3 = getTop3(leaderboard);
      const progress = getAllProgress(users, checkins, planDay);
      const winners = getMonthlyWinners();
      const prevMonth = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return monthKey(d);
      })();
      ensureMonthlyWinnersRecorded(prevMonth);

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
    return handleApi(req, res, pathname);
  }
  serveStatic(req, res, pathname);
});

async function bootstrap() {
  try {
    console.log("正在同步 365 天讀經計劃（首次可能需要幾秒）…");
    await getReadingPlan();
    console.log("讀經計劃已就緒");
  } catch (e) {
    console.warn("讀經計劃載入警告:", e.message);
    console.warn("請執行: node scripts/fetch-reading-plan.js");
  }

  server.listen(PORT, HOST, () => {
    console.log(`\n📖 聖經追蹤器已啟動`);
    console.log(`   監聽 ${HOST}:${PORT}\n`);
  });
}

bootstrap();
