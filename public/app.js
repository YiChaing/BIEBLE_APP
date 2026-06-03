const API = "";

let auth = null;
let currentUser = null;
let userMap = {};
let refreshTimer = null;
let planBounds = null;
let calendarPlanDay = 1;
let calendarDate = "";
let mySuggestedPlanDay = 1;
let selectedDate = "";
let currentDayData = null;
let scriptureExpanded = false;
let scriptureLoadedFor = null;

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
    "auth/unauthorized-domain": `此網域未授權：請在 Firebase → Authentication → Settings → Authorized domains 新增「${location.hostname}」`,
  };
  return map[code] || err?.message || "登入失敗";
}

async function getIdToken(forceRefresh = false) {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
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

function formatZhDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function clampDate(dateStr) {
  if (!planBounds) return dateStr;
  if (dateStr < planBounds.startDate) return planBounds.startDate;
  if (dateStr > planBounds.endDate) return planBounds.endDate;
  return dateStr;
}

function resetScripturePanel() {
  scriptureExpanded = false;
  scriptureLoadedFor = null;
  $("scripture-toggle").setAttribute("aria-expanded", "false");
  $("scripture-full").classList.add("hidden");
  $("scripture-ot").innerHTML = "";
  $("scripture-nt").innerHTML = "";
  $("scripture-toggle").querySelector("span:last-child").textContent =
    "展開當日完整經文";
}

function renderScriptureBlock(el, block, cssClass) {
  if (!block) {
    el.innerHTML = "";
    return;
  }
  if (block.error) {
    el.innerHTML = `<p class="scripture-error">${escapeHtml(block.error)}</p>`;
    return;
  }
  const verses =
    block.verses?.length > 0
      ? block.verses
          .map(
            (v) =>
              `<p class="scripture-verse"><span class="vn">${v.chap}:${v.sec}</span> ${escapeHtml(v.text)}</p>`
          )
          .join("")
      : '<p class="meta-line">暫無經文內容</p>';
  el.className = `scripture-block ${cssClass}`;
  el.innerHTML = `<h3>${escapeHtml(block.title || block.label)}</h3>${verses}`;
}

async function loadScripture(planDay) {
  $("scripture-loading").classList.remove("hidden");
  try {
    const { scripture } = await api(`/api/scripture?planDay=${planDay}`);
    renderScriptureBlock($("scripture-ot"), scripture.oldTestament, "");
    renderScriptureBlock($("scripture-nt"), scripture.newTestament, "nt-block");
    scriptureLoadedFor = planDay;
  } catch (e) {
    $("scripture-ot").innerHTML = `<p class="scripture-error">${escapeHtml(e.message)}</p>`;
    $("scripture-nt").innerHTML = "";
  } finally {
    $("scripture-loading").classList.add("hidden");
  }
}

function renderDayView(day) {
  currentDayData = day;
  selectedDate = day.date;

  $("date-input").value = day.date;
  $("date-input").min = planBounds?.startDate || day.planStartDate;
  $("date-input").max = planBounds?.endDate || day.date;
  $("plan-day").textContent = day.planDay;

  const entry = day.entry;
  $("ot-passage").textContent = entry?.oldTestament || "—";
  $("nt-passage").textContent = entry?.newTestament || "—";

  let title = formatZhDate(day.date);
  if (day.isToday) title += "（今日）";
  $("reading-title").textContent = title;
  $("reading-eyebrow").textContent = day.isToday ? "今日讀經" : "讀經內容";

  const hint = $("date-hint");
  hint.className = "date-hint";
  if (day.isFuture) {
    hint.textContent = "超前閱讀（可預習並打卡）";
    hint.classList.add("future");
  } else if (day.planDay < calendarPlanDay && !day.checked) {
    hint.textContent = "補讀／補打卡";
    hint.classList.add("catchup");
  } else if (day.checked) {
    hint.textContent = "此日已完成打卡";
  } else {
    hint.textContent = `計劃第 1 天：${day.planStartDate}`;
  }

  const btn = $("checkin-btn");
  const status = $("checkin-status");
  const btnText = $("checkin-btn-text");

  if (!currentUser) {
    btn.disabled = true;
    status.textContent = "請登入後打卡";
    status.className = "badge";
    btnText.textContent = "打卡";
  } else if (day.checked) {
    btn.disabled = true;
    status.textContent = "此日已打卡 ✓";
    status.className = "badge done";
    btnText.textContent = "已打卡";
  } else {
    btn.disabled = false;
    status.textContent = day.isToday ? "今日尚未打卡" : "可補打卡";
    status.className = "badge";
    btnText.textContent = day.isToday ? "今日打卡" : `第 ${day.planDay} 天打卡`;
  }

  $("date-prev").disabled = day.date <= (planBounds?.startDate || day.date);
  $("date-next").disabled = day.date >= (planBounds?.endDate || day.date);

  if (scriptureLoadedFor !== day.planDay) {
    resetScripturePanel();
  }

  renderDevotion(day);
}

let devotionSaveHintTimer = null;

function renderDevotion(day) {
  const guest = $("devotion-guest");
  const editor = $("devotion-editor");
  const hint = $("devotion-saved-hint");

  hint.classList.add("hidden");
  if (devotionSaveHintTimer) {
    clearTimeout(devotionSaveHintTimer);
    devotionSaveHintTimer = null;
  }

  if (!currentUser) {
    guest.classList.remove("hidden");
    editor.classList.add("hidden");
    return;
  }

  guest.classList.add("hidden");
  editor.classList.remove("hidden");

  const d = day.devotion;
  $("devotion-text").value = d?.content || "";
  $("devotion-updated").textContent = d?.updatedAt
    ? `上次儲存：${formatDate(d.updatedAt)}`
    : "";
}

async function loadDay(dateStr) {
  const date = clampDate(dateStr);
  const day = await api(`/api/day?date=${date}`);
  if (day.mySuggestedPlanDay) mySuggestedPlanDay = day.mySuggestedPlanDay;
  calendarPlanDay = day.calendarPlanDay;
  renderDayView(day);
  return day;
}

function buildUserMap(users) {
  userMap = {};
  for (const u of users || []) {
    userMap[u.userId || u.id] = u;
  }
}

function getPhoto(userId) {
  return userMap[userId]?.photoURL || "";
}

function renderDashboardStats(data) {
  currentUser = data.currentUser;
  buildUserMap(data.allProgress);
  updateUserHeader(currentUser);

  calendarPlanDay = data.calendarPlanDay;
  calendarDate = data.calendarDate;
  planBounds = data.planBounds;
  if (data.mySuggestedPlanDay) mySuggestedPlanDay = data.mySuggestedPlanDay;

  $("date-input").min = planBounds.startDate;
  $("date-input").max = planBounds.endDate;

  const meta = data.planMeta;
  $("plan-meta").textContent = meta
    ? `計劃：${meta.name || "一年讀一遍"} · 第 1 天 ${data.planStartDate} · 經文來源：信望愛聖經網`
    : "";

  const me = data.allProgress?.find((p) => p.userId === currentUser?.id);
  const members = data.allProgress?.length || 0;
  const todayDone = data.allProgress?.filter((p) => p.checkedToday).length || 0;
  $("stat-members").textContent = members;
  $("stat-today-done").textContent = todayDone;
  $("stat-my-streak").textContent = me?.streak ?? "—";
  $("stat-my-total").textContent = me?.totalCheckins ?? "—";

  renderTop3(data.monthlyTop3);
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

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderTop3(top3) {
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

async function loadDashboard() {
  const data = await api("/api/dashboard");
  renderDashboardStats(data);
  const dateToShow = selectedDate || calendarDate || data.calendarDate;
  await loadDay(dateToShow);
}

$("google-login-btn").addEventListener("click", async () => {
  $("auth-error").textContent = "";
  const btn = $("google-login-btn");
  btn.disabled = true;
  setLoading(true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await auth.signInWithPopup(provider);
    await result.user.getIdToken(true);
    await enterDashboard();
  } catch (err) {
    if (err.message && !err.code) {
      $("auth-error").textContent = err.message;
    } else {
      $("auth-error").textContent = mapFirebaseError(err);
    }
    showAuth();
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

$("devotion-save-btn").addEventListener("click", async () => {
  if (!currentUser || !currentDayData) return;
  const btn = $("devotion-save-btn");
  btn.disabled = true;
  try {
    const content = $("devotion-text").value;
    const res = await api("/api/devotion", {
      method: "POST",
      body: JSON.stringify({
        planDay: currentDayData.planDay,
        content,
      }),
    });
    currentDayData.devotion = res.devotion;
    $("devotion-updated").textContent = res.devotion?.updatedAt
      ? `上次儲存：${formatDate(res.devotion.updatedAt)}`
      : "";
    const hint = $("devotion-saved-hint");
    hint.classList.remove("hidden");
    if (devotionSaveHintTimer) clearTimeout(devotionSaveHintTimer);
    devotionSaveHintTimer = setTimeout(() => hint.classList.add("hidden"), 2500);
    showToast("靈修心得已儲存（僅自己可見）");
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("checkin-btn").addEventListener("click", async () => {
  if (!currentDayData) return;
  const btn = $("checkin-btn");
  btn.disabled = true;
  try {
    await api("/api/checkin", {
      method: "POST",
      body: JSON.stringify({ planDay: currentDayData.planDay }),
    });
    showToast(`第 ${currentDayData.planDay} 天打卡成功！`);
    await loadDashboard();
  } catch (err) {
    showToast(err.message);
    btn.disabled = false;
  }
});

$("date-input").addEventListener("change", async () => {
  const v = $("date-input").value;
  if (v) {
    resetScripturePanel();
    await loadDay(v);
  }
});

$("date-prev").addEventListener("click", async () => {
  if (!selectedDate) return;
  resetScripturePanel();
  await loadDay(addDays(selectedDate, -1));
});

$("date-next").addEventListener("click", async () => {
  if (!selectedDate) return;
  resetScripturePanel();
  await loadDay(addDays(selectedDate, 1));
});

$("btn-today").addEventListener("click", async () => {
  resetScripturePanel();
  await loadDay(calendarDate);
});

$("btn-my-progress").addEventListener("click", async () => {
  resetScripturePanel();
  const day = await api(`/api/day?planDay=${mySuggestedPlanDay}`);
  const date = day.date;
  await loadDay(date);
  showToast(
    mySuggestedPlanDay <= calendarPlanDay
      ? `已跳至第 ${mySuggestedPlanDay} 天（建議補讀）`
      : `已跳至第 ${mySuggestedPlanDay} 天`
  );
});

$("scripture-toggle").addEventListener("click", async () => {
  scriptureExpanded = !scriptureExpanded;
  $("scripture-toggle").setAttribute("aria-expanded", scriptureExpanded);
  $("scripture-full").classList.toggle("hidden", !scriptureExpanded);
  $("scripture-toggle").querySelector("span:last-child").textContent =
    scriptureExpanded ? "收合當日完整經文" : "展開當日完整經文";

  if (scriptureExpanded && currentDayData) {
    if (scriptureLoadedFor !== currentDayData.planDay) {
      await loadScripture(currentDayData.planDay);
    }
  }
});

let entering = false;

async function enterDashboard() {
  if (entering) return;
  entering = true;
  setLoading(true);
  try {
    await getIdToken(true);
    const { user } = await api("/api/auth/me");
    currentUser = user;
    showDashboard();
    updateUserHeader(user);
    $("auth-error").textContent = "";
    await loadDashboard();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadDashboard, 60000);
  } finally {
    entering = false;
    setLoading(false);
  }
}

async function initApp() {
  setLoading(true);
  try {
    await initFirebase();
    auth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        if ($("dashboard-view").classList.contains("hidden")) {
          try {
            await enterDashboard();
          } catch (err) {
            console.error(err);
            await auth.signOut().catch(() => {});
            showAuth();
            $("auth-error").textContent =
              err.message ||
              "無法連線伺服器驗證登入，請檢查 Render 的 Firebase 環境變數";
          }
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
