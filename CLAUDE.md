# CLAUDE.md

Personal, local-only comics library web app. The source of truth for requirements is `prd/PRD_漫畫管理系統.md`.

## Hard rules
- **UI language is Traditional Chinese only** (zh-Hant). No i18n framework and no English UI strings. Dates use the `YYYY/MM/DD` format.
- **Comic files are read-only.** Never write, rename, move or delete anything under `COMICS_ROOT`. Only `data/` is writable.
- The server binds to `127.0.0.1` only.
- All config comes from `.env` (see `.env.example`). Never hardcode `G:\Comics` or the SumatraPDF path in code.
- The DB stores file paths **relative to `COMICS_ROOT`**, so changing drives keeps user data.
- User edits are stored as overrides (`auto_*` fields hold parsed values; user values win). A rescan never overwrites user edits.
- Opening a file is only allowed for volume IDs in the DB whose resolved path lies inside `COMICS_ROOT`. Launch with `subprocess.Popen([sumatra, path])` using a list argument, never `shell=True`.
- Paths contain `[]`, `【】`, CJK and full-width characters. Use `pathlib` and never use glob patterns built from file names.

## Stack and layout
- `backend/`: FastAPI + SQLModel (SQLite at `data/library.db`). Modules: `config.py`, `db.py`, `models.py`, `parser.py` (filename parsing), `scanner.py` (background scan), `covers.py` (thumbnails → `data/covers/*.webp`), `launcher.py` (SumatraPDF / Explorer), `routers/`.
- `frontend/`: React + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query. In production FastAPI serves `frontend/dist`. In dev, Vite proxies `/api` to `:8000`.
- `start.bat`: one-click launcher (ASCII + CRLF, see `.gitattributes`). It creates `.env`, the venv and packages (reinstalling when `requirements.txt` changes), rebuilds the frontend when `frontend/src` is newer than `dist`, picks a free port (it recognises a running instance via `GET /api/health` → `{"app": "comics-library"}`) and opens the browser.

## Domain model
Category (top-level folder, mapped via `CATEGORY_MAP`) → Series → Volume (file). Supported extensions come from `FILE_TYPES`.

Series discovery (`scanner.classify`) walks the folder tree once and recurses:
- A folder with ≤1 sub-folder holding comics, or whose sub-folders are all volume folders (`Vol_01`, `000-100`) or format variants (`ePub`, `PDF格式`; see `is_generic_dir`), is **one series**.
- Otherwise it is an **author/collection folder**. Each sub-folder is classified again, and loose files are grouped by `parser.loose_title` into virtual series whose `rel_path` is `<folder>/*<title>` (`*` can't occur in Windows paths). The top-level container name becomes `group_name` and the default author, unless it is a franchise name contained in the series name.
- Multi-part RARs only keep `.part1`.

## Commands
```bash
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000   # backend dev
.venv\Scripts\python -m pytest backend/tests                             # backend tests
cd frontend && npm run dev                                               # frontend dev
cd frontend && npm run build                                             # production build
```

## Performance gotchas
- SQLite picked low-selectivity indexes (`is_missing`) and turned joins into full scans (10 s queries). Keep the composite `ix_volume_series_present (series_id, is_missing, sort_key)` and run `db.analyze()` after scans. Don't add `index=True` to boolean or status columns.
- Cover extraction runs in its own small thread pool (`routers/system.py`), so uncached covers can't starve the shared FastAPI threadpool.

## Conventions
- Keep the parser pure and unit-tested (`backend/tests/test_parser.py`) with real-world filename samples.
- Scanning must handle around 30k files; batch DB writes and log per-file errors instead of failing the scan.
- Follow the frontend-design / frontend-ui-engineering skills for UI work. The design should look professional and calm, with covers as the hero element.
