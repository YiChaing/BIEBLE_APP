# Firebase 設定教學（Gmail 登入 + Firestore）

## 1. 建立 Firebase 專案

1. 打開 [Firebase Console](https://console.firebase.google.com/)
2. **新增專案** → 名稱例如 `bieble-tracker`

## 2. 啟用 Google 登入（Gmail）

1. 左側 **Build** → **Authentication** → **Get started**
2. **Sign-in method** → 點 **Google** → **啟用**
3. 設定 **專案支援電子郵件**（你的 Gmail）→ **儲存**

> 可關閉「電子郵件/密碼」，本 App 僅使用 Google 登入。

### 授權網域（重要 — 出現「此網域未授權」時必做）

1. 打開 [Firebase Console](https://console.firebase.google.com/) → 選你的專案
2. 左側 **Build** → **Authentication**
3. 上方分頁點 **Settings**（設定，齒輪圖示那一區）
4. 往下找到 **Authorized domains**（授權網域）
5. 點 **Add domain**（新增網域）
6. 輸入你網站的網域（**只填網域，不要加 https:// 或路徑**）

| 你開啟的網址 | 要新增的網域 |
|--------------|--------------|
| `https://bieble-tracker.onrender.com` | `bieble-tracker.onrender.com` |
| `https://xxx.onrender.com` | `xxx.onrender.com`（改成你的服務名稱） |
| 本機測試 `http://localhost:3847` | `localhost`（通常已內建） |

7. 點 **Add** → 等約 1 分鐘 → 重新整理網頁再點「使用 Gmail 登入」

> 如何確認自己的 Render 網域：Render 服務頁上方會顯示 URL，或看瀏覽器網址列 `https://????.onrender.com` 中間那段。

未加入授權網域會出現 `auth/unauthorized-domain` 錯誤。

## 3. 建立 Firestore

1. **Firestore Database** → **建立資料庫**
2. **正式版模式**
3. 區域：**asia-east1** 或 **asia-northeast1**

## 4. Firestore 安全規則

Firestore → **規則** → 貼上 `firestore.rules` → **發布**

## 5. Web 設定（前端）

專案設定 → **您的應用程式** → **</>** Web → 註冊應用

| 環境變數 | firebaseConfig |
|----------|----------------|
| `FIREBASE_API_KEY` | apiKey |
| `FIREBASE_AUTH_DOMAIN` | authDomain |
| `FIREBASE_PROJECT_ID` | projectId |
| `FIREBASE_STORAGE_BUCKET` | storageBucket |
| `FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `FIREBASE_APP_ID` | appId |

## 6. Admin 金鑰（後端）

專案設定 → **服務帳戶** → **產生新的私密金鑰**

| 環境變數 | JSON 欄位 |
|----------|-----------|
| `FIREBASE_CLIENT_EMAIL` | client_email |
| `FIREBASE_PRIVATE_KEY` | private_key |

### Render 貼 private key（常見登入失敗原因）

1. 在 JSON 檔複製 `private_key` 整段（含 `-----BEGIN PRIVATE KEY-----`）
2. 在 Render Environment 新增 `FIREBASE_PRIVATE_KEY`
3. **建議做法**：貼成**一行**，把真實換行改成 `\n`（反斜線 + n）
4. 或用雙引號包住整段，例如：`"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`
5. `FIREBASE_PROJECT_ID` 必須與前端 `firebaseConfig.projectId` **完全相同**

若 Gmail 登入後仍顯示「請先登入」，多半是 **PRIVATE_KEY 格式錯誤** 或 **專案 ID 不一致**。

## 7. Render 環境變數

```
PORT=3847
HOST=0.0.0.0
DATA_DIR=/app/data
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

## 8. Firestore 讀取上限（出現「已超過每日使用限制」）

免費 Spark 方案約 **每天 5 萬次讀取**。若排行榜自動刷新、分頁長時間開著，容易在一天內用完。

**當天已超限時：**

1. **關閉**所有開著聖經追蹤器的瀏覽器分頁（含手機背景分頁）
2. 等到 **次日**（Firebase 以太平洋時間重置每日額度）再使用
3. 部署最新程式（含排行榜 **5 分鐘快取**、**無自動刷新**、需手動點「重新整理」）

**若要持續給約 50 人使用、避免再被擋：**

1. Firebase Console → **升級**專案為 **Blaze（隨用隨付）**
2. 仍享免費額度，超出後才計費；小團體通常每月僅數美元
3. 可設 [預算快訊](https://console.firebase.google.com/project/_/usage) 避免意外費用

**Render 選用環境變數（選填）：**

| 變數 | 說明 | 預設 |
|------|------|------|
| `DASHBOARD_CACHE_MS` | 排行榜快取毫秒數 | `300000`（5 分鐘） |

## 9. 部署與驗證

1. 上傳最新程式到 GitHub（含 `seed/reading-plan-365.json`、最新 `Dockerfile`）
2. Render **Manual Deploy**
3. 開啟網站 → **使用 Gmail 登入**
4. `/api/health` 應為 `"firebase": true`

## Firestore 資料結構

```
users/{uid}     → email, displayName, photoURL, provider, createdAt
checkins/{id}   → userId, date, planDay, oldTestament, newTestament
devotions/{id}  → userId, planDay, content, createdAt, updatedAt（id = userId_planDay，僅本人 API 可讀寫）
monthly_winners/{YYYY-MM} → winners[]
```
