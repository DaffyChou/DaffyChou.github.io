# Notion 專案管理整合儀表板

> 從 Notion 資料庫拉取專案/任務/Bug,自動計算 KPI、風險評分、人員工作量,呈現為**單檔 HTML 即時儀表板**。

![status](https://img.shields.io/badge/status-active-green) ![tasks](https://img.shields.io/badge/tasks-306-blue) ![projects](https://img.shields.io/badge/projects-11-orange)

## 線上展示

部署後可貼上你的網址,例如:
- 公開靜態版:`https://your-site.netlify.app/`
- Cowork 互動版:從 Cowork sidebar 開啟 artifact `notion-pm-dashboard`

## 功能特色

- 📊 **七大區塊**:KPI、任務分組樹、人員工作量、每人活躍任務明細、待追蹤、風險分析、後續建議
- 🔄 **即時更新**(Cowork 模式):透過 `window.cowork.callMcpTool` 重新拉 Notion 最新資料
- 💾 **24h localStorage 快取**:減少重複呼叫 Notion API
- 🎯 **白名單過濾**:只追蹤指定的 11 個專案,避免跨團隊雜訊
- 🚦 **風險評分**:8 條規則自動評分(高/中/低/安全)
- 🔍 **Grid.js 全任務搜尋**
- 📈 **Chart.js 視覺化**:doughnut + 堆疊長條圖

## 目錄結構

```
notion-pm-dashboard/
├── index.html              # 公開靜態版(直接部署用)
├── live.html               # Cowork 互動版(需 callMcpTool)
├── README.md
├── LICENSE                 # MIT
├── netlify.toml            # Netlify 部署設定
├── .gitignore
│
├── src/                    # 原始碼(便於改寫/維護)
│   ├── template.html       # HTML 結構 + CSS
│   ├── script.js           # 互動邏輯與 render 函式
│   └── build.py            # Notion → JSON pipeline
│
├── data/                   # 資料
│   ├── dashboard_data.json # 編譯後的儀表板資料(已嵌入 index.html)
│   ├── projects_snapshot.json
│   └── raw_*.txt           # Notion API 原始回應(供除錯參考)
│
└── docs/
    └── 開發網誌.md          # 完整開發紀錄與技術心得
```

## 快速部署

### 方案 A:Netlify Drop(無需註冊,1 分鐘完成)

1. 開 https://app.netlify.com/drop
2. 拖曳 `index.html`(或整個 repo 資料夾)進去
3. 立即得到公開網址 `random-name.netlify.app`

### 方案 B:GitHub Pages

```bash
git init
git add .
git commit -m "feat: initial dashboard"
git remote add origin https://github.com/YOUR_NAME/notion-pm-dashboard.git
git push -u origin main

# 在 GitHub repo 設定 → Pages → Source: main, root → Save
# 數分鐘後可訪問 https://YOUR_NAME.github.io/notion-pm-dashboard/
```

### 方案 C:Vercel / Cloudflare Pages

把整個 repo 連上 Vercel 或 Cloudflare Pages,`index.html` 會自動成為首頁。

### 方案 D:本機快速預覽

```bash
python3 -m http.server 8000
# 開 http://localhost:8000
```

## 自動化:GitHub Actions 每日重建 + Pages 部署

本 repo 已內建 `.github/workflows/build.yml`,設定後:
- ⏰ **每天 06:00 (台灣時間)** 自動執行 build.py 重抓 Notion → 產出新 index.html
- 🚀 自動 commit 變更並 push 到 main
- 🌐 自動觸發 GitHub Pages 部署
- 🔧 也可在 Actions 頁面手動觸發(workflow_dispatch)

### 一次性設定步驟

#### 1. 建立 Notion Integration
1. 前往 https://www.notion.so/my-integrations
2. 點 **+ New integration** → 命名(例 `pm-dashboard-bot`)→ 選你的 workspace
3. 建立後複製 **Internal Integration Token**(`secret_xxxxx...`)
4. 把 token 加到 3 個資料庫:打開**專案 / 任務 / 修正清單**每一個 → 右上 `⋯` → **Connections** → 找到 `pm-dashboard-bot` → 點 **Confirm**
   - 必須這步,否則 Integration 沒有讀取權限

#### 2. GitHub repo 設定 Secret
1. push 此 repo 到 GitHub
2. Repo → **Settings → Secrets and variables → Actions**
3. **New repository secret**:
   - Name: `NOTION_TOKEN`
   - Value: 上一步的 `secret_xxxxx...`

#### 3. 啟用 GitHub Pages
1. Repo → **Settings → Pages**
2. **Source**: `GitHub Actions`(不是 Deploy from branch)
3. 儲存

#### 4. 觸發第一次 build
- 自動:推送任何 commit 到 main(會觸發 push 條件)
- 手動:Actions tab → **Daily Dashboard Build & Deploy** → **Run workflow**
- 等待:約 1-3 分鐘,完成後 Pages URL `https://YOUR_USER.github.io/notion-pm-dashboard/` 即上線

### 排程說明
```yaml
schedule:
  - cron: '0 22 * * *'   # 22:00 UTC = 06:00 Asia/Taipei (隔日)
```
要改頻率(例如每 6 小時、每週),修改這行 cron 即可。

### 手動本機重建
若 GitHub Actions 暫時停擺,本機也可跑:
```bash
export NOTION_TOKEN=secret_xxxxx
pip install -r requirements.txt
python3 src/build.py
git commit -am "data: $(date -u +%Y-%m-%d)" && git push
```

### Cowork 內快速更新
打開 `live.html` 的 Cowork artifact → 按 **🔄 重新拉取** → 自動更新並快取(只更新本機,不影響線上)

## 風險評分規則

| 條件 | 分數 |
|---|---|
| 結案需優化 | +3 |
| 合約已逾期(且未結案) | +3 |
| 暫停 | +2 |
| 無負責人(且未結案) | +2 |
| 合約 30 天內到期 | +2 |
| 積壓但有任務 | +1 |
| 未結 bug > 5 | +1 |
| 任務量 > 50 | +1 |

| 等級 | 條件 |
|---|---|
| 高 | ≥ 5 |
| 中 | ≥ 3 |
| 低 | ≥ 1 |
| 安全 | 0 |

## 技術棧

| 層 | 技術 |
|---|---|
| 資料來源 | Notion (3 個 database) |
| MCP 工具 | `not
