# Firebase 設定教學（Auth + Firestore）

## 1. 建立 Firebase 專案

1. 打開 [Firebase Console](https://console.firebase.google.com/)
2. **新增專案** → 名稱例如 `bieble-tracker`
3. 依序完成建立（Analytics 可關閉）

## 2. 啟用 Authentication

1. 左側 **Build** → **Authentication**
2. **Get started**
3. **Sign-in method** → 啟用 **電子郵件/密碼**（Email/Password）

> 使用者仍以「帳號」登入，系統會自動轉成 `帳號@bieble.app` 的內部 Email。

## 3. 建立 Firestore

1. 左側 **Firestore Database** → **建立資料庫**
2. 選 **正式版模式**（我們用規則禁止前端直連）
3. 區域選 **asia-east1**（台灣較近）或 **asia-northeast1**

## 4. 上傳 Firestore 安全規則

1. Firestore → **規則**
2. 貼上專案裡 `firestore.rules` 的內容 → **發布**

## 5. 取得 Web 設定（前端）

1. 專案總覽 → 齒輪 **專案設定**
2. 下方 **您的應用程式** → 點 **</>**（Web）
3. 註冊應用程式 → 複製 `firebaseConfig` 各欄位

對應環境變數：

| 變數 | firebaseConfig 欄位 |
|------|---------------------|
| `FIREBASE_API_KEY` | apiKey |
| `FIREBASE_AUTH_DOMAIN` | authDomain |
| `FIREBASE_PROJECT_ID` | projectId |
| `FIREBASE_STORAGE_BUCKET` | storageBucket |
| `FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `FIREBASE_APP_ID` | appId |

## 6. 取得 Admin 金鑰（後端）

1. **專案設定** → **服務帳戶**
2. **產生新的私密金鑰** → 下載 JSON
3. 從 JSON 填入：

| 變數 | JSON 欄位 |
|------|-----------|
| `FIREBASE_CLIENT_EMAIL` | client_email |
| `FIREBASE_PRIVATE_KEY` | private_key（整段含 BEGIN/END） |

### Render 填寫 private key 注意

- 在 Render Environment 貼上時，換行改成 `\n` 一行，或整段用雙引號包住
- 範例：`"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`

## 7. Render 環境變數清單

在 Web Service → **Environment** 新增：

```
PORT=3847
HOST=0.0.0.0
DATA_DIR=/app/data
FIREBASE_API_KEY=（你的）
FIREBASE_AUTH_DOMAIN=（你的）
FIREBASE_PROJECT_ID=（你的）
FIREBASE_STORAGE_BUCKET=（你的）
FIREBASE_MESSAGING_SENDER_ID=（你的）
FIREBASE_APP_ID=（你的）
FIREBASE_CLIENT_EMAIL=（你的）
FIREBASE_PRIVATE_KEY=（你的，注意換行）
```

**不必再加 Disk**（資料已在 Firestore）。

## 8. 重新部署

GitHub push 後 Render 自動部署，或 **Manual Deploy**。

> **注意**：`data/reading-plan-365.json` 不必上傳 GitHub。Docker 建置時會自動從 DayByWord 抓取。若建置失敗，請確認 Render 建置日誌中有網路連線。

## 9. 驗證

- `https://你的網址/api/health` → `"firebase": true`
- 註冊新帳號 → 打卡 → 重新部署後資料仍在

## Firestore 資料結構

```
users/{uid}           → username, displayName, createdAt
usernames/{username}  → uid
checkins/{autoId}     → userId, date, planDay, oldTestament, newTestament, createdAt
monthly_winners/{YYYY-MM} → month, recordedAt, winners[]
```
