const API = "";

let auth = null;
let currentUser = null;
let userMap = {};
let refreshTimer = null;

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2800);
}

function setLoading(show) {
  $("loading-overlay").classList.toggle("hidden", !show);
}

function mapFirebaseError(err) {
  const code = err?.code || "";
  const map = {
    "auth/popup-closed-by-user": "已取消登入",
    "auth/cancelled-popup-request": "請稍候再試",
    "auth/popup-blocked": "請允許彈出視窗後再試",
    "auth/account-exists-with-different-credential": "此 Email 已使用其他方式註冊",
    "auth/network-request-failed": "網路連線失敗",
    "auth/unauthorized-domain": "此網域未授權，請在 Firebase 加入授權網域",
  };
  return map[code] || err?.message || "登入失敗";
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

function updateUserHeader(user) {
  const avatar = $("user-avatar");
  if (user?.photoURL) {
    avatar.src = user.photoURL;
    avatar.alt = user.displayName;
    avatar.classList.remove("hidden");
  } else {
    avatar.classList.add("hidden");
  }
  $("user-greeting").textContent = user ? user.displayName : "";
  $("user-email").textContent = user?.email || "";
}

$("google-login-btn").addEventListener("click", async () => {
  $("auth-error").textContent = "";
  const btn = $("google-login-btn");
  btn.disabled = true;
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await auth.signInWithPopup(provider);
  } catch (err) {
    $("auth-error").textContent = mapFirebaseError(err);
  } finally {
    btn.disabled = false;
    setLoading(false);
  }
});

$("logout-btn").addEventListener("click", async () => {
  await auth.signOut();
  currentUser = null;
  if (refreshTimer) clearInterval(refreshTimer);
  showAuth();
  showToast("已登出");
});

$("checkin-btn").addEventListener("click", async () => {
  const btn = $("checkin-btn");
  btn.disabled = true;
  try {
    await api("/api/checkin", { method: "POST" });
    showToast("打卡成功！願主的話語成為您的力量");
    await loadDashboard();
  } catch (err) {
    showToast(err.message);
    btn.disabled = false;
  }
});

function buildUserMap(users) {
  userMap = {};
  for (const u of users || []) {
    userMap[u.userId || u.id] = u;
  }
}

function getPhoto(userId) {
  return userMap[userId]?.photoURL || "";
}

function renderDashboard(data) {
  currentUser = data.currentUser;
  buildUserMap(data.allProgress);

  updateUserHeader(currentUser);

  $("plan-day").textContent = data.planDay;
  $("ot-passage").textContent = data.today?.oldTestament || "—";
  $("nt-passage").textContent = data.today?.newTestament || "—";

  const meta = data.planMeta;
  $("plan-meta").textContent = meta
    ? `計劃：${meta.name || "一年讀一遍"} · 更新：${formatDate(meta.updatedAt)}`
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

  const members = data.allProgress?.length || 0;
  const todayDone = data.allProgress?.filter((p) => p.checkedToday).length || 0;
  $("stat-members").textContent = members;
  $("stat-today-done").textContent = todayDone;
  $("stat-my-streak").textContent = me?.streak ?? "—";
  $("stat-my-total").textContent = me?.totalCheckins ?? "—";

  renderTop3(data.monthlyTop3, data.leaderboard);
  renderLeaderboard(data.leaderboard);
  renderProgress(data.allProgress);
  renderWinnersHistory(data.monthlyWinners);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function avatarHtml(userId, name, size = "avatar") {
  const url = getPhoto(userId);
  if (url) {
    return `<img class="${size}" src="${escapeAttr(url)}" alt="${escapeAttr(name)}" loading="lazy" />`;
  }
  const initial = (name || "?").charAt(0).toUpperCase();
  return `<span class="rank rank-initial">${initial}</span>`;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderTop3(top3, fullList) {
  const el = $("top3-podium");
  if (!top3?.length) {
    el.innerHTML = '<p class="meta-line">本月尚無打卡記錄</p>';
    return;
  }
  const order = [1, 0, 2];
  const medals = ["gold", "silver", "bronze"];
  const labels = ["🥇", "🥈", "🥉"];
  el.innerHTML = order
    .map((idx) => {
      const u = top3[idx];
      if (!u) return "";
      return `
      <div class="podium-item ${idx === 0 ? "podium-1" : ""}">
        <div class="podium-medal rank ${medals[idx]}">${labels[idx]}</div>
        ${avatarHtml(u.userId, u.displayName)}
        <div class="name">${escapeHtml(u.displayName)}</div>
        <div class="count">${u.monthlyCheckins} 次</div>
      </div>`;
    })
    .join("");
}

function renderLeaderboard(list) {
  const ul = $("leaderboard-list");
  if (!list?.length) {
    ul.innerHTML = '<li class="meta-line">尚無成員</li>';
    return;
  }
  ul.innerHTML = list
    .map((u, i) => {
      const rankClass =
        i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
      const photo = getPhoto(u.userId);
      const av = photo
        ? `<img class="member-avatar" src="${escapeAttr(photo)}" alt="" loading="lazy" />`
        : `<span class="rank">${i + 1}</span>`;
      return `
      <li>
        ${i < 3 ? `<span class="rank ${rankClass}">${i + 1}</span>` : av}
        ${i < 3 && photo ? `<img class="member-avatar" src="${escapeAttr(photo)}" alt="" />` : ""}
        <span class="member-name">${escapeHtml(u.displayName)}</span>
        <span style="margin-left:auto;color:var(--muted);flex-shrink:0">${u.monthlyCheckins} 次</span>
      </li>`;
    })
    .join("");
}

function renderProgress(allProgress) {
  const tbody = $("progress-tbody");
  if (!allProgress?.length) {
    tbody.innerHTML = '<tr><td colspan="4">尚無成員</td></tr>';
    return;
  }
  const sorted = [...allProgress].sort((a, b) => {
    if (a.checkedToday !== b.checkedToday) return a.checkedToday ? -1 : 1;
    return b.totalCheckins - a.totalCheckins;
  });
  tbody.innerHTML = sorted
    .map((p) => {
      const isMe = p.userId === currentUser?.id;
      const photo = p.photoURL || getPhoto(p.userId);
      const av = photo
        ? `<img src="${escapeAttr(photo)}" alt="" loading="lazy" />`
        : "";
      return `
      <tr class="${isMe ? "me" : ""}">
        <td>
          <div class="member-cell">
            ${av}
            <span>${escapeHtml(p.displayName)}${isMe ? "（我）" : ""}</span>
          </div>
        </td>
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
  setLoading(true);
  try {
    const { user } = await api("/api/auth/me");
    currentUser = user;
    showDashboard();
    updateUserHeader(user);
    await loadDashboard();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadDashboard, 30000);
  } finally {
    setLoading(false);
  }
}

async function initApp() {
  setLoading(true);
  try {
    await initFirebase();
    auth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        try {
          await enterDashboard();
        } catch (err) {
          console.error(err);
          showAuth();
          $("auth-error").textContent = err.message || "載入失敗";
        }
      } else {
        currentUser = null;
        setLoading(false);
        showAuth();
      }
    });
  } catch (err) {
    setLoading(false);
    $("auth-error").textContent = err.message;
    showAuth();
  }
}

initApp();
