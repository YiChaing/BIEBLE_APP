# 聖經追蹤器

線上讀經打卡網頁應用：會員登入、每日舊約／新約讀經進度、全員進度看板、每月排行榜前三名。

## 功能

- **會員系統**：註冊、登入、登出（帳密儲存於本機 `data/users.json`）
- **每日打卡**：依當日曆第 N 天對應 365 天計劃中的舊約、新約經文
- **共同畫面**：所有人進度、連續天數、累計打卡同一頁顯示
- **每月排行榜**：當月打卡次數排序，即時顯示前三名；過去月份自動封存得獎紀錄
- **中文介面**：繁體中文書名與 UI
- **365 進度**：啟動時從 [DayByWord 一年讀一遍](https://daybyword.org/zh-CN/plans/read-bible-in-a-year) 同步，並快取於 `data/reading-plan-365.json`

## 啟動方式

需要 **Node.js 18+**（內建 `fetch`）。

```bash
cd c:\BIEBLE_APP
node scripts/fetch-reading-plan.js   # 可選：手動更新讀經計劃
node server.js
```

瀏覽器開啟：**http://localhost:3847**

（若已安裝 npm，也可執行 `npm start`）

## 目錄結構

```
BIEBLE_APP/
  server.js              # HTTP 伺服器與 API
  public/                # 前端頁面
  lib/                   # 認證、計劃、統計
  data/                  # 使用者、打卡、讀經計劃（執行後產生）
  scripts/fetch-reading-plan.js
```

## API 摘要

| 路徑 | 說明 |
|------|------|
| `POST /api/auth/register` | 註冊 |
| `POST /api/auth/login` | 登入 |
| `POST /api/auth/logout` | 登出 |
| `GET /api/auth/me` | 目前使用者 |
| `GET /api/dashboard` | 儀表板（進度、排行榜、今日經文） |
| `POST /api/checkin` | 今日打卡 |
| `GET /api/reading-plan` | 今日讀經計劃 |

## 注意事項

- 資料儲存在本機 JSON 檔，適合小團體或開發測試；正式上線建議改用資料庫並啟用 HTTPS。
- 讀經計劃內容來自 DayByWord 公開頁面，請尊重其使用條款。
