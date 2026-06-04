const {
  getUsers,
  getCheckins,
  getMonthlyWinners,
} = require("./firestore");
const {
  monthKey,
  buildLeaderboard,
  getTop3,
  archivePastMonths,
  getAllProgress,
  ensureMonthlyWinnersRecorded,
} = require("./stats");
const {
  getReadingPlan,
  getCalendarPlanDay,
  getPlanBounds,
  formatDateOnly,
  PLAN_START_DATE,
} = require("./plan");
const {
  getCached,
  setCached,
  getCachedAllowStale,
} = require("./dashboard-cache");

function isFirestoreQuotaError(e) {
  const code = e?.code;
  const msg = String(e?.message || "");
  return (
    code === 8 ||
    code === "resource-exhausted" ||
    /quota|exceeded|limit|RESOURCE_EXHAUSTED/i.test(msg)
  );
}

async function fetchSharedDashboardFromDb() {
  const plan = await getReadingPlan();
  const calendarPlanDay = getCalendarPlanDay();
  const [users, checkins, winners] = await Promise.all([
    getUsers(),
    getCheckins(),
    getMonthlyWinners(),
  ]);
  await archivePastMonths(checkins, winners, users);
  const ym = monthKey();
  const leaderboard = buildLeaderboard(users, checkins, ym);
  const top3 = getTop3(leaderboard);
  const progress = getAllProgress(users, checkins, calendarPlanDay);
  const prevMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return monthKey(d);
  })();
  await ensureMonthlyWinnersRecorded(prevMonth, { users, checkins, winners });

  return {
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
    checkins,
  };
}

async function loadSharedDashboard() {
  const fresh = getCached();
  if (fresh) return { data: fresh, stale: false, fromCache: true };

  try {
    const data = await fetchSharedDashboardFromDb();
    setCached(data);
    return { data, stale: false, fromCache: false };
  } catch (e) {
    if (isFirestoreQuotaError(e)) {
      const stale = getCachedAllowStale();
      if (stale) {
        return { data: stale, stale: true, fromCache: true, quotaExceeded: true };
      }
      const err = new Error(
        "Firestore 今日讀取已達上限，請明天再試，或升級 Firebase 為 Blaze 方案"
      );
      err.code = "firestore/quota-exceeded";
      throw err;
    }
    throw e;
  }
}

module.exports = {
  loadSharedDashboard,
  isFirestoreQuotaError,
};
