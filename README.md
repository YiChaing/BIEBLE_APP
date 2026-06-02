# 聖經追蹤器

線上讀經打卡：Firebase 登入、Firestore 永久保存、365 天讀經計劃、排行榜。

## 功能

- Firebase Authentication（僅 Gmail / Google 登入）
- Cloud Firestore（使用者、打卡、每月前三名）
- 每日舊約／新約經文、全員進度看板
- 適合 Render Free（**不需持久化 Disk**）

## 快速開始

### 1. 設定 Firebase

請照 **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)** 逐步完成。

### 2. 本機執行

```bash
cp .env.example .env
# 編輯 .env 填入 Firebase 變數

npm install
node server.js
```

瀏覽器：**http://localhost:3847**

### 3. 部署到 Render

1. 上傳專案到 GitHub（**必須包含** `seed/reading-plan-365.json` 與最新 `Dockerfile`）
2. Render 建立 Web Service（Docker）
3. 在 Environment 貼上所有 `FIREBASE_*` 變數（見 FIREBASE_SETUP.md）
4. 部署完成

## 登入說明

- 僅支援 **Gmail（Google 帳號）** 一鍵登入
- 請在 Firebase 啟用 Google 登入，並將 Render 網域加入授權網域

## 專案結構

```
lib/firebase-admin.js   # Admin SDK
lib/firestore.js        # 資料庫操作
lib/auth.js             # Token 驗證
public/app.js           # Firebase 前端登入
FIREBASE_SETUP.md       # 設定教學
firestore.rules         # 安全規則（需上傳到 Firebase）
```
