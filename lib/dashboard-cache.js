/**
 * 排行榜共用資料快取，減少 Firestore 讀取（所有使用者共用同一份快照）
 */
const TTL_MS = Number(process.env.DASHBOARD_CACHE_MS) || 5 * 60 * 1000;

let cache = { at: 0, payload: null };

function isFresh() {
  return cache.payload && Date.now() - cache.at < TTL_MS;
}

function getCached() {
  return isFresh() ? cache.payload : null;
}

/** 配額用盡時仍可回傳過期快取，避免整站無法使用 */
function getCachedAllowStale() {
  return cache.payload || null;
}

function setCached(payload) {
  cache = { at: Date.now(), payload };
}

function invalidateDashboardCache() {
  cache = { at: 0, payload: null };
}

module.exports = {
  getCached,
  getCachedAllowStale,
  setCached,
  invalidateDashboardCache,
  dashboardCacheTtlMs: TTL_MS,
};
