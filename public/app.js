const API = "";
const AUTH_EMAIL_DOMAIN = "bieble.app";

let auth = null;
let authMode = "login";
let currentUser = null;
let dashboardData = null;
let refreshTimer = null;

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2800);
}

function usernameToEmail(username) {
  const safe = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (safe.length < 2) throw new Error("帳號至少需要 2 個字元");
  return `${safe}@${AUTH_EMAIL_DOMAIN}`;
}

function mapFirebaseError(err) {
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "此帳號已被使用",
    "auth/invalid-email": "帳號格式不正確",
    "auth/weak-password": "密碼至少需要 6 個字元",
    "auth/user-not-found": "帳號或密碼錯誤",
    "auth/wrong-password": "帳號或密碼錯誤",
    "auth/invalid-credential": "帳號或密碼錯誤",
    "auth/too-many-requests": "嘗試次數過多，請稍後再試",
  };
  return map[code] || err?.message || "操作失敗";
}

async function getIdToken() {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken();
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  const token = await getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "請求失敗");
  return data;
}

async function initFirebase() {
  const config = await fetch(`${API}/api/firebase-config`).then((r) => {
    if (!r.ok) throw new Error("無法載入 Firebase 設定");
    return r.json();
  });
  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }
  auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
}

function showAuth() {
  $("auth-view").classList.remove("hidden");
  $("dashboard-view").classList.add("hidden");
}

function showDashboard() {
  $("auth-view").classList.add("hidden");
  $("dashboard-view").classList.remove("hidden");
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  $("display-name-group").classList.toggle("hidden", !isRegister);
  $("auth-submit").textContent = isRegister ? "註冊並進入" : "登入";
  $("auth-mode-text").textContent = isRegister ? "已有帳號？" : "還沒有帳號？";
  $("auth-toggle").textContent = isRegister ? "返回登入" : "立即註冊";
  $("auth-error").textContent = "";
}

$("auth-toggle").addEventListener("click", (e) => {
  e.preventDefault();
  setAuthMode(authMode === "login" ? "register" : "login");
});

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("auth-error").textContent = "";
  const username = $("username").value.trim();
  const password = $("password").value;
  const displayName = $("displayName").value.trim();

  try {
    if (authMode === "register") {
      if (password.length < 6) {
        throw new Error("密碼至少需要 6 個字元（Firebase 要求）");
      }
      const name = username.toLowerCase();
      const { available } = await api(
        `/api/auth/check-username?username=${encodeURIComponent(name)}`
      );
      if (!available) throw new Error("此帳號已被使用");

      const email = usernameToEmail(username);
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({
        displayName: displayName || username,
      });
      await api("/api/users/setup", {
        method: "POST",
        body: JSON.stringify({
          username: name,
          displayName: displayName || username,
        }),
      });
      showToast("註冊成功，歡迎加入！");
    } else {
      const email = usernameToEmail(username);
      await auth.signInWithEmailAndPassword(email, password);
    }
    await enterDashboard();
  } catch (err) {
    $("auth-error").textContent = mapFirebaseError(err);
  }
});

$("logout-btn").addEventListener("click", async () => {
  await auth.signOut();
  currentUser = null;
  if (refreshTimer) clearInterval(refreshTimer);
  showAuth();
});

$("checkin-btn").addEventListener("click", async () => {
  try {
    await api("/api/checkin", { method: "POST" });
    showToast("打卡成功！願主的話語成為您的力量");
    await loadDashboard();
  } catch (err) {
    showToast(err.message);
  }
});

function renderDashboard(data) {
  dashboardData = data;
  currentUser = data.currentUser;

  $("user-greeting").textContent = currentUser
    ? `你好，${currentUser.displayName}`
    : "訪客（請登入以打卡）";

  $("plan-day").textContent = data.planDay;
  $("ot-passage").textContent = data.today?.oldTestament || "—";
  $("nt-passage").textContent = data.today?.newTestament || "—";

  const meta = data.planMeta;
  $("plan-meta").textContent = meta
    ? `計劃：${meta.name || "一年讀一遍"} · 資料更新：${formatDate(meta.updatedAt)} · 來源：DayByWord`
    : "";

  const me = data.allProgress?.find((p) => p.userId === currentUser?.id);
  const checked = me?.checkedToday;
  const btn = $("checkin-btn");
  const status = $("checkin-status");

  if (!currentUser) {
    btn.disabled = true;
    status.textContent = "請登入後打卡";
    status.className = "badge";
  } else if (checked) {
    btn.disabled = true;
    status.textContent = "今日已打卡 ✓";
    status.className = "badge done";
  } else {
    btn.disabled = false;
    status.textContent = "尚未打卡";
    status.className = "badge";
  }

  renderTop3(data.monthlyTop3);
  renderLeaderboard(data.leaderboard);
  renderProgress(data.allProgress);
  renderWinnersHistory(data.monthlyWinners);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
}

function renderTop3(top3) {
  const el = $("top3-podium");
  if (!top3?.length) {
    el.innerHTML = '<p class="meta-line">本月尚無打卡記錄</p>';
    return;
  }
  const medals = ["gold", "silver", "bronze"];
  const labels = ["🥇", "🥈", "🥉"];
  el.innerHTML = top3
    .map(
      (u, i) => `
    <div class="podium-item">
      <div class="rank ${medals[i]}">${labels[i]}</div>
      <div class="name">${escapeHtml(u.displayName)}</div>
      <div class="count">${u.monthlyCheckins} 次打卡</div>
    </div>`
    )
    .join("");
}

function renderLeaderboard(list) {
  const ul = $("leaderboard-list");
  if (!list?.length) {
    ul.innerHTML = "<li>尚無成員</li>";
    return;
  }
  ul.innerHTML = list
    .map((u, i) => {
      const rankClass =
        i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
      return `
      <li>
        <span class="rank ${rankClass}">${i + 1}</span>
        <span>${escapeHtml(u.displayName)}</span>
        <span style="margin-left:auto;color:var(--muted)">${u.monthlyCheckins} 次</span>
      </li>`;
    })
    .join("");
}

function renderProgress(allProgress) {
  const tbody = $("progress-tbody");
  if (!allProgress?.length) {
    tbody.innerHTML = '<tr><td colspan="4">尚無成員資料</td></tr>';
    return;
  }
  tbody.innerHTML = allProgress
    .map((p) => {
      const isMe = p.userId === currentUser?.id;
      return `
      <tr class="${isMe ? "me" : ""}">
        <td>${escapeHtml(p.displayName)}${isMe ? "（我）" : ""}</td>
        <td>${p.checkedToday ? '<span class="badge done">已打卡</span>' : '<span class="badge">未打卡</span>'}</td>
        <td><span class="badge streak">${p.streak} 天</span></td>
        <td>${p.totalCheckins}</td>
      </tr>`;
    })
    .join("");
}

function renderWinnersHistory(winners) {
  const el = $("winners-history");
  if (!winners?.length) {
    el.innerHTML = '<p class="meta-line">尚無歷史紀錄</p>';
    return;
  }
  el.innerHTML = winners
    .map(
      (w) => `
    <div class="month-block">
      <strong>${w.month}</strong>
      <ul class="leaderboard-list" style="margin-top:0.35rem">
        ${w.winners
          .map(
            (x) =>
              `<li><span class="rank gold">${x.rank}</span> ${escapeHtml(x.displayName)} — ${x.checkins} 次</li>`
          )
          .join("")}
      </ul>
    </div>`
    )
    .join("");
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  renderDashboard(data);
}

async function enterDashboard() {
  const { user } = await api("/api/auth/me");
  if (user.needsProfile) {
    throw new Error("帳號資料未完成，請重新註冊");
  }
  currentUser = user;
  showDashboard();
  await loadDashboard();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadDashboard, 30000);
}

async function initApp() {
  try {
    await initFirebase();
    auth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        try {
          await enterDashboard();
        } catch {
          showAuth();
        }
      } else {
        currentUser = null;
        showAuth();
        setAuthMode("login");
      }
    });
  } catch (err) {
    $("auth-error").textContent = err.message;
    showAuth();
  }
}

initApp();
