# Render 建置錯誤修復

若看到：

```
"/data/reading-plan-365.json": not found
```

代表 GitHub 上的 **Dockerfile 是舊版**，或 **缺少讀經計劃檔案**。

## 請上傳這 2 個檔案到 GitHub（覆蓋舊版）

1. `Dockerfile`（專案根目錄）
2. `seed/reading-plan-365.json`（約 112 KB）

路徑必須完全一致，例如：

```
bieble-tracker/
  Dockerfile
  seed/
    reading-plan-365.json
```

## 然後在 Render

1. **Settings** → **Build & Deploy** → **Clear build cache**
2. **Manual Deploy** → **Deploy latest commit**

## 如何確認 GitHub 已是新版

打開 GitHub 上的 `Dockerfile`，應包含這一行：

```
COPY seed/reading-plan-365.json ./data/reading-plan-365.json
```

**不應**再出現：

```
COPY data/reading-plan-365.json
```
