"""FastAPI entry point. Run: python -m backend.main  (or uvicorn backend.main:app)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import covers, scanner
from .config import FRONTEND_DIST, settings
from .db import init_db
from .routers import library, system

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if settings.scan_on_startup and settings.comics_root_ok:
        scanner.start_scan("incremental")
    else:
        covers.start_worker()
    yield


app = FastAPI(title="漫畫書庫", lifespan=lifespan)
app.include_router(library.router)
app.include_router(system.router)

# Serve the built React app (frontend/dist) with SPA fallback.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(FRONTEND_DIST.resolve()):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=settings.port, log_level="info")
