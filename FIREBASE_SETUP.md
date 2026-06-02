# Firebase 設定教學（Gmail 登入 + Firestore）

## 1. 建立 Firebase 專案

1. 打開 [Firebase Console](https://console.firebase.google.com/)
2. **新增專案** → 名稱例如 `bieble-tracker`

## 2. 啟用 Google 登入（Gmail）

1. 左側 **Build** → **Authentication** → **Get started**
2. **Sign-in method** → 點 **Google** → **啟用**
3. 設定 **專案支援電子郵件**（你的 Gmail）→ **儲存**

> 可關閉「電子郵件/密碼」，本 App 僅使用 Google 登入。

### 授權網域（重要）

1. Authentication → **Settings** → **Authorized domains**
2. 確認已有 `localhost`
3. 新增你的 Render 網域，例如：`bieble-tracker.onrender.com`

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

Render 貼 private key 時，換行改 `\n`。

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

## 8. 部署與驗證

1. 上傳最新程式到 GitHub（含 `seed/reading-plan-365.json`、最新 `Dockerfile`）
2. Render **Manual Deploy**
3. 開啟網站 → **使用 Gmail 登入**
4. `/api/health` 應為 `"firebase": true`

## Firestore 資料結構

```
users/{uid}     → email, displayName, photoURL, provider, createdAt
checkins/{id}   → userId, date, planDay, oldTestament, newTestament
monthly_winners/{YYYY-MM} → winners[]
```
