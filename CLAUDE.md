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
- `start.bat`: one-click launcher (creates the venv, installs deps, builds the frontend if needed, runs the server, opens the browser).

## Domain model
Category (top-level folder, mapped via `CATEGORY_MAP`) → Series (2nd-level folder; a loose file in a category folder becomes a single-volume series) → Volume (file). Supported extensions come from `FILE_TYPES`.

## Commands
```bash
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000   # backend dev
.venv\Scripts\python -m pytest backend/tests                             # backend tests
cd frontend && npm run dev                                               # frontend dev
cd frontend && npm run build                                             # production build
```

## Conventions
- Keep the parser pure and unit-tested (`backend/tests/test_parser.py`) with real-world filename samples.
- Scanning must handle around 30k files; batch DB writes and log per-file errors instead of failing the scan.
- Follow the frontend-design / frontend-ui-engineering skills for UI work. The design should look professional and calm, with covers as the hero element.
