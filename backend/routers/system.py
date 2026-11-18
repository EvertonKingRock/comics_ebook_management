from __future__ import annotations

import asyncio
import csv
import io
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session, col, select

from .. import covers, scanner
from ..config import COVERS_DIR, DB_PATH, settings
from ..db import get_session
from ..models import ScanLog
from .library import SERIES_SQL, _row

router = APIRouter(prefix="/api")


def _scalar(session: Session, sql: str, **params):
    return session.exec(text(sql), params=params).one()[0]  # type: ignore[call-overload]


@router.get("/health")
def health():
    """Used by start.bat to recognise this app on a port."""
    return {"app": "comics-library", "ok": True}


# ---------------------------------------------------------------- covers

CACHE = {"Cache-Control": "public, max-age=86400"}


# Extraction gets its own small pool so a wall of uncached covers never starves the
# shared request threadpool (which would stall quick calls like /api/categories).
_cover_pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="cover-req")


@router.get("/covers/volume/{volume_id}")
async def volume_cover(volume_id: int):
    p = covers.cover_path(volume_id)
    if not p.exists():
        p = await asyncio.get_running_loop().run_in_executor(_cover_pool, covers.ensure_cover, volume_id)
    if p is None:
        raise HTTPException(404, "無封面")
    return FileResponse(p, media_type="image/webp", headers=CACHE)


class RebuildBody(BaseModel):
    failed_only: bool = False


@router.post("/covers/rebuild")
def rebuild_covers(body: RebuildBody):
    covers.reset_covers(failed_only=body.failed_only)
    covers.start_worker()
    return {"ok": True}


# ---------------------------------------------------------------- scan

class ScanBody(BaseModel):
    mode: Literal["incremental", "full"] = "incremental"


@router.post("/scan")
def start_scan(body: ScanBody):
    if not scanner.start_scan(body.mode):
        raise HTTPException(409, "掃描正在進行中")
    return {"ok": True}


@router.get("/scan/status")
def scan_status():
    return {**scanner.state.as_dict(), "covers": dict(covers.worker_state)}


@router.get("/scan/logs")
def scan_logs(session: Session = Depends(get_session)):
    return session.exec(select(ScanLog).order_by(col(ScanLog.id).desc()).limit(20)).all()


# ---------------------------------------------------------------- stats

@router.get("/stats")
def stats(session: Session = Depends(get_session)):
    totals = dict(session.exec(text("""
        SELECT COUNT(DISTINCT v.series_id) AS series, COUNT(*) AS volumes, COALESCE(SUM(v.size_bytes), 0) AS size,
               SUM(v.read_status = 'read') AS read, SUM(v.read_status = 'reading') AS reading,
               SUM(v.read_status = 'unread') AS unread
        FROM volume v WHERE v.is_missing = 0
    """)).one()._mapping)  # type: ignore[call-overload]
    totals["favorites"] = _scalar(session, "SELECT COUNT(*) FROM series WHERE is_favorite = 1 AND is_missing = 0")

    by_category = [dict(r._mapping) for r in session.exec(text("""
        SELECT c.id, c.display_name AS name, COUNT(DISTINCT s.id) AS series, COUNT(v.id) AS volumes,
               COALESCE(SUM(v.size_bytes), 0) AS size, COALESCE(SUM(v.read_status = 'read'), 0) AS read
        FROM category c
        LEFT JOIN series s ON s.category_id = c.id AND s.is_missing = 0
        LEFT JOIN volume v ON v.series_id = s.id AND v.is_missing = 0
        GROUP BY c.id ORDER BY c.sort_order
    """)).all()]  # type: ignore[call-overload]

    formats = [dict(r._mapping) for r in session.exec(text("""
        SELECT ext, COUNT(*) AS count, SUM(size_bytes) AS size FROM volume WHERE is_missing = 0
        GROUP BY ext ORDER BY count DESC
    """)).all()]  # type: ignore[call-overload]

    status = [dict(r._mapping) for r in session.exec(text(f"""
        SELECT status, COUNT(*) AS count FROM ({SERIES_SQL}) x GROUP BY status ORDER BY count DESC
    """)).all()]  # type: ignore[call-overload]

    recent_added = [_row(r) for r in session.exec(text(f"SELECT * FROM ({SERIES_SQL}) x ORDER BY added_at DESC, id DESC LIMIT 12")).all()]  # type: ignore[call-overload]
    recent_read = [dict(r._mapping) for r in session.exec(text("""
        SELECT v.id, v.volume_label, v.file_name, v.read_status, v.last_opened_at, v.series_id,
               COALESCE(s.user_title, s.auto_title) AS series_title
        FROM volume v JOIN series s ON s.id = v.series_id
        WHERE v.last_opened_at IS NOT NULL AND v.is_missing = 0
        ORDER BY v.last_opened_at DESC LIMIT 10
    """)).all()]  # type: ignore[call-overload]

    quality = {
        "missing_author": _scalar(session, f"SELECT COUNT(*) FROM ({SERIES_SQL}) x WHERE author IS NULL"),
        "missing_files": _scalar(session, "SELECT COUNT(*) FROM volume WHERE is_missing = 1"),
        "cover_failed": _scalar(session, "SELECT COUNT(*) FROM volume WHERE cover_state = 'failed'"),
        "untagged": _scalar(session, f"SELECT COUNT(*) FROM ({SERIES_SQL}) x WHERE id NOT IN (SELECT series_id FROM seriestag)"),
    }
    last_scan = session.exec(select(ScanLog).where(col(ScanLog.finished_at).is_not(None)).order_by(col(ScanLog.id).desc())).first()
    return {
        "totals": totals, "by_category": by_category, "formats": formats, "status": status,
        "recent_added": recent_added, "recent_read": recent_read, "quality": quality,
        "last_scan": last_scan,
    }


# ---------------------------------------------------------------- settings

@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    root = settings.comics_root
    mapped = {f for f, _ in settings.category_map}
    unmapped = []
    if root.is_dir():
        try:
            unmapped = sorted(e.name for e in os.scandir(root) if e.is_dir() and e.name not in mapped)
        except OSError:
            pass
    return {
        "comics_root": str(root),
        "comics_root_ok": root.is_dir(),
        "sumatra_path": str(settings.sumatra_path or ""),
        "sumatra_ok": bool(settings.sumatra_path and settings.sumatra_path.is_file()),
        "sevenzip_path": str(settings.sevenzip_path or ""),
        "sevenzip_ok": bool(settings.sevenzip_path and settings.sevenzip_path.is_file()),
        "port": settings.port,
        "file_types": sorted(settings.file_types),
        "scan_on_startup": settings.scan_on_startup,
        "categories": [
            {"folder_name": f, "display_name": d, "exists": (root / f).is_dir()} for f, d in settings.category_map
        ],
        "unmapped_folders": unmapped,
        "db_path": str(DB_PATH),
        "db_size": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        "cover_count": sum(1 for _ in COVERS_DIR.glob("*.webp")),
        "series_count": _scalar(session, "SELECT COUNT(*) FROM series WHERE is_missing = 0"),
    }


# ---------------------------------------------------------------- export

STATUS_ZH = {"ongoing": "連載中", "finished": "已完結", "stopped": "停刊", "unknown": "未知"}
READ_ZH = {"unread": "未讀", "reading": "閱讀中", "read": "已讀"}


@router.get("/export.csv")
def export_csv(session: Session = Depends(get_session)):
    rows = [_row(r) for r in session.exec(text(f"SELECT * FROM ({SERIES_SQL}) x ORDER BY category_id, title")).all()]  # type: ignore[call-overload]
    tags = {}
    for sid, name in session.exec(text("SELECT st.series_id, t.name FROM seriestag st JOIN tag t ON t.id = st.tag_id")).all():  # type: ignore[call-overload]
        tags.setdefault(sid, []).append(name)
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens UTF-8 correctly
    w = csv.writer(buf)
    w.writerow(["分類", "書名", "原文書名", "作者", "出版社", "狀態", "總集數", "擁有集數", "已讀集數",
                "閱讀狀態", "格式", "容量(MB)", "評分", "收藏", "標籤", "路徑"])
    for r in rows:
        w.writerow([
            r["category_name"], r["title"], r["original_title"] or "", r["author"] or "", r["publisher"] or "",
            STATUS_ZH.get(r["status"], r["status"]), r["total_volumes"] or "", r["volume_count"], r["read_count"],
            READ_ZH.get(r["read_state"], ""), "/".join(f.upper() for f in r["formats"]),
            round((r["total_size"] or 0) / 1048576, 1), r["rating"] or "", "是" if r["is_favorite"] else "",
            "、".join(tags.get(r["id"], [])), r["rel_path"],
        ])
    return Response(
        content=buf.getvalue().encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename*=UTF-8''comics_library.csv"},
    )

