# 漫畫書庫（Comics Library）

個人本機使用的漫畫電子書管理系統。自動掃描漫畫資料夾（PDF / EPUB / ZIP / RAR / 7Z / MOBI），以「系列 → 集數」方式整理，提供封面牆、搜尋篩選、資料編輯、閱讀狀態、收藏與統計儀表板；雙擊即以 **SumatraPDF** 開啟閱讀。

> 全介面繁體中文 · 僅於本機 `127.0.0.1` 執行 · 對漫畫檔案唯讀，不會修改或移動任何檔案

## 功能
- 📂 **自動掃描**：依資料夾結構建立書庫（分類 / 系列 / 集數），支援增量掃描
- 🏷 **檔名解析**：自動從 `[港漫][書名][作者][出版社][22完]` 等命名中擷取資料
- 🖼 **封面縮圖**：自動擷取 PDF / EPUB / 壓縮檔封面並快取
- 🔍 **瀏覽與搜尋**：分類（香港 / 日本 / 台灣 / 美國）、封面牆 / 清單、篩選、排序
- ✏️ **資料編輯**：書名、作者、出版社、狀態、標籤、評分、簡介、備註（重新掃描不會覆蓋）
- 📖 **閱讀狀態與收藏**：未讀 / 閱讀中 / 已讀、收藏、最近閱讀
- 📊 **統計儀表板**：各分類數量、容量、格式分佈、閱讀進度
- ▶️ **一鍵開啟**：雙擊集數即以 SumatraPDF 開啟

## 系統需求
- Windows 10 / 11
- [Python 3.11+](https://www.python.org/downloads/)
- [Node.js 20+](https://nodejs.org/)（首次編譯前端用）
- [SumatraPDF](https://www.sumatrapdfreader.org/)

## 快速開始
1. 下載或 clone 本專案。
2. **雙擊 `start.bat`**。首次執行會自動：
   - 由 `.env.example` 建立 `.env`
   - 建立 Python 虛擬環境並安裝套件
   - 安裝並編譯前端
   - 啟動伺服器並開啟瀏覽器（預設 `http://127.0.0.1:8000`）
3. 關閉命令視窗即停止服務。

## 設定（`.env`）
| 變數 | 說明 | 預設值 |
|---|---|---|
| `COMICS_ROOT` | 漫畫來源資料夾 | `G:\Comics` |
| `SUMATRA_PATH` | SumatraPDF 路徑（留空自動尋找） | （空） |
| `PORT` | 埠號 | `8000` |
| `CATEGORY_MAP` | 分類資料夾:顯示名稱 | `HK:香港,Japan:日本,TW:台灣,US:美國` |
| `FILE_TYPES` | 納入管理的副檔名 | `pdf,epub,zip,cbz,rar,cbr,7z,mobi` |
| `SCAN_ON_STARTUP` | 啟動時自動增量掃描 | `true` |

更換磁碟機時，只要修改 `COMICS_ROOT` 並重新掃描即可。資料庫以相對路徑記錄檔案，閱讀狀態、評分、標籤等資料會完整保留。

## 資料夾結構要求
```
COMICS_ROOT\
├─ HK\                 ← 分類
│  └─ 系列資料夾\       ← 系列
│     └─ 第01集.pdf    ← 集數
├─ Japan\
├─ TW\
└─ US\
```

## 技術架構
- **後端**：Python · FastAPI · SQLModel（SQLite）· PyMuPDF · Pillow
- **前端**：React · TypeScript · Vite · Tailwind CSS · shadcn/ui
- **資料**：`data/library.db`（單一檔案，可直接複製備份）、`data/covers/`（封面快取）

## 開發
```bash
# 後端
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000

# 前端（開發模式，API 代理至 8000）
cd frontend
npm install
npm run dev
```

## 文件
- [產品需求文件（PRD）](prd/PRD_漫畫管理系統.md)
