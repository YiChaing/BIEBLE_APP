# AERO GO — AI Sandbox / GiMATE 概念 Demo

這是一個**技術概念 Demo**，對應 `PRD`（AERO GO）第 4 節「功能需求」與第 7 節「關鍵 API 設計」中描述的：

- **GiMATE 動態調度代理程式**（VRAM 智慧分配）
- **企業級 AI 沙盒搭售方案（Futurenest 聯名整合）**

並提供一個模擬的「GIGABYTE 控制中心」網頁，可互動操作這兩項功能與均溫板散熱模式切換。

---

## 範疇與限制（請務必先讀）

這是事實、推論與假設的區分，避免本 Demo 被誤讀為「已實作/已驗證的產品功能」：

| 類別 | 說明 |
|---|---|
| **事實** | PRD 第 4/7 節確實定義了這 4 個 API（`vram/status`、`vram/allocate`、`cooling/mode`、`sandbox/verify`）與對應的輸入輸出規格。本 Demo 的 API 路徑與欄位名稱直接取自 PRD。 |
| **假設** | VRAM 數值（128GB 分配、各程序佔用量）、散熱模式的 TGP/風扇/溫度數字、license_code 格式（`FN-XXXX-XXXX`）皆為**本 Demo 自行假設的示意數據**，並非來自實測或工程驗證。 |
| **未驗證 / Roadmap** | 根據專案提案單 5.1 與 PRD 第 4 節新增的「狀態備註」：GiMATE 與 Futurenest 聯名沙盒之 VRAM/算力分配機制，目前定位為 **Roadmap — 尚未經 AI Team 驗證**。本 Demo 不代表該功能已具備可量產的技術基礎。 |
| **未整合** | 本 Demo **未連接**任何真實硬體、GiMATE 後端或 Futurenest 系統。`sandbox/verify` 僅做格式檢查（mock），不是真實的企業授權驗證。Futurenest 的合作狀態本身也仍待確認（PRD 9.）。 |
| **資料持久性** | 所有狀態存於記憶體，重啟伺服器即重置；不寫入任何檔案或資料庫。 |
| **使用者提供之概念架構（未見於 PRD/提案單）** | AI Sandbox 卡片新增的「三階段安全架構」UI（① 模型權重 Hash/簽章 + TPM 2.0/HWID 綁定 → ② NDIS 過濾驅動切換為預設拒絕、僅允許 127.0.0.1 → ③ 於 128GB UMA 劃出受保護記憶體區/Protected Enclave）為**使用者本人提出的安全設計描述**，本 Demo 僅將其轉成 UI 互動流程與 mock 狀態（`model_integrity_verified`、`tpm_hwid_bound`、`ndis_isolation_active`、`protected_enclave_gb`），**未經 AI Team / 資安團隊評估其在 GB10 SoC 上的可行性**，亦未見於 PRD 第4節或提案單 5.1 原文。`protected_enclave_gb`（目前設為 16GB）與 Performance 卡的 VRAM 可分配上限（`effective_vram_total`）之間的連動，也是本 Demo 為呈現「兩卡互相影響」而自行設計的示意邏輯，非 PRD 規格。 |

**這個 Demo 適合用在**：跟主管/團隊討論 PRD 規格時，快速展示「這些 API 串起來後，使用者操作起來大致是什麼樣子」，幫助溝通設計意圖。

**這個 Demo 不適合用在**：作為「功能已可行」或「Futurenest 整合已就位」的證明——這兩點目前都缺乏資料來源，引用時請保留 PRD/提案單中標註的「待確認」字樣。

---

## 執行方式

僅使用 Python 標準函式庫，無需安裝套件：

```bash
python3 app.py
```

預設於 `http://localhost:8000` 啟動，瀏覽器開啟即可看到控制中心介面。

---

## API 對照表

| Endpoint | Method | 對應 PRD 描述 | Demo 行為 |
|---|---|---|---|
| `/api/gimate/vram/status` | GET | 獲取 128GB 統一記憶體分配比例、佔用進程、即時使用率 | 回傳 mock 的 3 個程序（Local LLM / Adobe Premiere / Blender）與剩餘容量；新增 `physical_total_gb`（固定128）、`reserved_for_sandbox_gb`、`total_gb`（=可分配上限，沙盒啟用後變為112） |
| `/api/gimate/vram/allocate` | POST | 根據 PID 動態設定 VRAM 鎖定上限/下限 | 依 `min_gb`/`max_gb` 與「目前可分配上限」（128GB，沙盒啟用後為112GB）做驗證；超過上限時回傳錯誤並註明沙盒保留量，**不會**自動降級其他程序（該自動降級邏輯屬 PRD 8. 的 Roadmap 範圍，未實