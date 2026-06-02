# 聖經追蹤器

線上讀經打卡：Firebase 登入、Firestore 永久保存、365 天讀經計劃、排行榜。

## 功能

- Firebase Authentication（帳號登入，密碼至少 6 字元）
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

1. 上傳專案到 GitHub（**不必**上傳 `data/reading-plan-365.json`，建置時會自動下載）
2. Render 建立 Web Service（Docker）
3. 在 Environment 貼上所有 `FIREBASE_*` 變數（見 FIREBASE_SETUP.md）
4. 部署完成

## 登入說明

- 畫面上填的是 **帳號**（不是 Email）
- 系統內部使用 `你的帳號@bieble.app` 註冊 Firebase
- 密碼至少 **6** 個字元

## 專案結構

```
lib/firebase-admin.js   # Admin SDK
lib/firestore.js        # 資料庫操作
lib/auth.js             # Token 驗證
public/app.js           # Firebase 前端登入
FIREBASE_SETUP.md       # 設定教學
firestore.rules         # 安全規則（需上傳到 Firebase）
```
