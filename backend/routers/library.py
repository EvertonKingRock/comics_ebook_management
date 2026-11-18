from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlmodel import Session, col, select

from ..db import get_session
from ..launcher import LaunchError, open_in_sumatra, reveal_in_explorer
from ..models import Category, Series, SeriesTag, Tag, Volume, now
from ..scanner import abs_path

router = APIRouter(prefix="/api")

ReadStatus = Literal["unread", "reading", "read"]
SeriesStatus = Literal["ongoing", "finished", "stopped", "unknown"]

# Shared SQL: one row per present series with aggregates.
SERIES_SQL = """
WITH agg AS (
  SELECT series_id,
         COUNT(*) AS volume_count,
         SUM(read_status = 'read') AS read_count,
         SUM(read_status = 'reading') AS reading_count,
         SUM(size_bytes) AS total_size,
         MAX(added_at) AS added_at,
         MAX(last_opened_at) AS last_opened_at,
         GROUP_CONCAT(DISTINCT ext) AS formats
  FROM volume WHERE is_missing = 0 GROUP BY series_id
)
SELECT s.id, s.category_id, c.display_name AS category_name, s.folder_name, s.group_name, s.rel_path,
       COALESCE(s.user_title, s.auto_title) AS title,
       COALESCE(s.user_author, s.auto_author) AS author,
       COALESCE(s.user_publisher, s.auto_publisher) AS publisher,
       COALESCE(s.user_status, s.auto_status) AS status,
       COALESCE(s.user_total_volumes, s.auto_total_volumes) AS total_volumes,
       s.user_original_title AS original_title,
       s.rating, s.is_favorite,
       COALESCE(s.cover_volume_id,
         (SELECT v2.id FROM volume v2 WHERE v2.series_id = s.id AND v2.is_missing = 0
          ORDER BY v2.cover_state = 'failed', v2.sort_key LIMIT 1)
       ) AS cover_volume_id,
       a.volume_count, a.read_count, a.reading_count, a.total_size, a.added_at, a.last_opened_at, a.formats,
       CASE WHEN a.read_count = a.volume_count THEN 'read'
            WHEN a.read_count = 0 AND a.reading_count = 0 THEN 'unread'
            ELSE 'reading' END AS read_state
FROM series s
JOIN agg a ON a.series_id = s.id
JOIN category c ON c.id = s.category_id
"""

# sort key → (nullable column to push NULLs last, or None; ORDER BY expression)
SORTS: dict[str, tuple[str | None, str]] = {
    "title": (None, "title COLLATE NOCASE"),
    "author": ("author", "author COLLATE NOCASE"),
    "added": (None, "added_at"),
    "volumes": (None, "volume_count"),
    "rating": ("rating", "rating"),
    "recent": ("last_opened_at", "last_opened_at"),
    "size": (None, "total_size"),
}


def _tags_for(session: Session, series_ids: list[int]) -> dict[int, list[dict]]:
    if not series_ids:
        return {}
    rows = session.exec(
        select(SeriesTag.series_id, Tag.id, Tag.name, Tag.color)
        .join(Tag, col(Tag.id) == SeriesTag.tag_id)
        .where(col(SeriesTag.series_id).in_(series_ids))
        .order_by(Tag.name)
    ).all()
    out: dict[int, list[dict]] = {}
    for sid, tid, name, color in rows:
        out.setdefault(sid, []).append({"id": tid, "name": name, "color": color})
    return out


def _row(r) -> dict:
    d = dict(r._mapping)
    d["is_favorite"] = bool(d["is_favorite"])
    d["formats"] = sorted((d.get("formats") or "").split(",")) if d.get("formats") else []
    return d


# ---------------------------------------------------------------- categories

@router.get("/categories")
def list_categories(session: Session = Depends(get_session)):
    rows = session.exec(text("""
        SELECT c.id, c.folder_name, c.display_name, c.sort_order,
               COUNT(DISTINCT s.id) AS series_count, COUNT(v.id) AS volume_count
        FROM category c
        LEFT JOIN series s ON s.category_id = c.id AND s.is_missing = 0
        LEFT JOIN volume v ON v.series_id = s.id AND v.is_missing = 0
        GROUP BY c.id ORDER BY c.sort_order
    """)).all()  # type: ignore[call-overload]
    return [dict(r._mapping) for r in rows]


# ---------------------------------------------------------------- series

@router.get("/series")
def list_series(
    session: Session = Depends(get_session),
    category_id: int | None = None,
    q: str | None = None,
    status: SeriesStatus | None = None,
    read: ReadStatus | None = None,
    favorite: bool | None = None,
    tag_id: int | None = None,
    format: str | None = None,
    sort: str = "title",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=500),
):
    where, params = [], {}
    if category_id:
        where.append("category_id = :cat")
        params["cat"] = category_id
    if q:
        where.append("""(title LIKE :q OR author LIKE :q OR publisher LIKE :q OR original_title LIKE :q
                     OR folder_name LIKE :q OR group_name LIKE :q
                     OR id IN (SELECT st.series_id FROM seriestag st JOIN tag t ON t.id = st.tag_id WHERE t.name LIKE :q))""")
        params["q"] = f"%{q.strip()}%"
    if status:
        where.append("status = :status")
        params["status"] = status
    if read:
        where.append("read_state = :read")
        params["read"] = read
    if favorite is not None:
        where.append("is_favorite = :fav")
        params["fav"] = 1 if favorite else 0
    if tag_id:
        where.append("id IN (SELECT series_id FROM seriestag WHERE tag_id = :tag)")
        params["tag"] = tag_id
    if format:
        where.append("(',' || formats || ',') LIKE :fmt")
        params["fmt"] = f"%,{format.lower()},%"

    base = f"SELECT * FROM ({SERIES_SQL}) x" + (f" WHERE {' AND '.join(where)}" if where else "")
    total = session.exec(text(f"SELECT COUNT(*) FROM ({base})"), params=params).one()[0]  # type: ignore[call-overload]
    nulls_col, expr = SORTS.get(sort, SORTS["title"])
    order_sql = (f"{nulls_col} IS NULL, " if nulls_col else "") + f"{expr} {order.upper()}"
    params.update(limit=page_size, offset=(page - 1) * page_size)
    rows = session.exec(text(f"{base} ORDER BY {order_sql}, id LIMIT :limit OFFSET :offset"), params=params).all()  # type: ignore[call-overload]
    items = [_row(r) for r in rows]
    tags = _tags_for(session, [i["id"] for i in items])
    for i in items:
        i["tags"] = tags.get(i["id"], [])
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def _series_or_404(session: Session, series_id: int) -> Series:
    s = session.get(Series, series_id)
    if s is None:
        raise HTTPException(404, "找不到此系列")
    return s


@router.get("/series/{series_id}")
def get_series(series_id: int, session: Session = Depends(get_session)):
    s = _series_or_404(session, series_id)
    row = session.exec(text(f"SELECT * FROM ({SERIES_SQL}) x WHERE id = :id"), params={"id": series_id}).first()  # type: ignore[call-overload]
    summary = _row(row) if row else {"id": s.id, "title": s.user_title or s.auto_title, "volume_count": 0}
    vols = session.exec(
        select(Volume).where(Volume.series_id == series_id, col(Volume.is_missing).is_(False)).order_by(Volume.sort_key)
    ).all()
    summary.update(
        tags=_tags_for(session, [series_id]).get(series_id, []),
        summary=s.user_summary or s.auto_summary,
        notes=s.notes,
        auto={
            "title": s.auto_title, "author": s.auto_author, "publisher": s.auto_publisher,
            "status": s.auto_status, "total_volumes": s.auto_total_volumes, "summary": s.auto_summary,
        },
        overrides={
            "title": s.user_title, "original_title": s.user_original_title, "author": s.user_author,
            "publisher": s.user_publisher, "status": s.user_status, "total_volumes": s.user_total_volumes,
            "summary": s.user_summary,
        },
        volumes=[
            {
                "id": v.id, "file_name": v.file_name, "rel_path": v.rel_path, "ext": v.ext, "size_bytes": v.size_bytes,
                "volume_label": v.volume_label, "volume_no": v.volume_no, "read_status": v.read_status,
                "last_opened_at": v.last_opened_at, "added_at": v.added_at, "cover_state": v.cover_state,
                "sub_path": v.rel_path[len(s.rel_path) + 1:] if v.rel_path.startswith(s.rel_path + "/") else v.file_name,
            }
            for v in vols
        ],
    )
    return summary


class SeriesPatch(BaseModel):
    title: str | None = None
    original_title: str | None = None
    author: str | None = None
    publisher: str | None = None
    status: SeriesStatus | None = None
    total_volumes: int | None = Field(None, ge=0)
    summary: str | None = None
    notes: str | None = None
    rating: int | None = Field(None, ge=0, le=5)
    is_favorite: bool | None = None
    cover_volume_id: int | None = None
    tag_ids: list[int] | None = None


OVERRIDE_FIELDS = ("title", "original_title", "author", "publisher", "status", "total_volumes", "summary")


def _set_tags(session: Session, series_id: int, tag_ids: list[int]) -> None:
    for st in session.exec(select(SeriesTag).where(SeriesTag.series_id == series_id)).all():
        session.delete(st)
    for tid in dict.fromkeys(tag_ids):
        if session.get(Tag, tid):
            session.add(SeriesTag(series_id=series_id, tag_id=tid))


@router.patch("/series/{series_id}")
def patch_series(series_id: int, body: SeriesPatch, session: Session = Depends(get_session)):
    """Only fields present in the body change. For override fields, null or '' reverts to the auto value."""
    s = _series_or_404(session, series_id)
    data = body.model_dump(exclude_unset=True)
    for f in OVERRIDE_FIELDS:
        if f in data:
            v = data[f]
            if isinstance(v, str):
                v = v.strip() or None
            setattr(s, f"user_{f}", v)
    if "notes" in data:
        s.notes = (data["notes"] or "").strip() or None
    if "rating" in data:
        s.rating = data["rating"] or None
    if "is_favorite" in data and data["is_favorite"] is not None:
        s.is_favorite = data["is_favorite"]
    if "cover_volume_id" in data:
        vid = data["cover_volume_id"]
        if vid is not None:
            v = session.get(Volume, vid)
            if v is None or v.series_id != series_id:
                raise HTTPException(400, "封面集數不屬於此系列")
        s.cover_volume_id = vid
    if data.get("tag_ids") is not None:
        _set_tags(session, series_id, data["tag_ids"])
    s.updated_at = now()
    session.add(s)
    session.commit()
    return get_series(series_id, session)


class ReadBody(BaseModel):
    read_status: ReadStatus


@router.post("/series/{series_id}/read-status")
def set_series_read(series_id: int, body: ReadBody, session: Session = Depends(get_session)):
    _series_or_404(session, series_id)
    for v in session.exec(select(Volume).where(Volume.series_id == series_id)).all():
        v.read_status = body.read_status
        session.add(v)
    session.commit()
    return {"ok": True}


class BatchBody(BaseModel):
    ids: list[int]
    is_favorite: bool | None = None
    status: SeriesStatus | None = None
    read_status: ReadStatus | None = None
    add_tag_ids: list[int] = []
    remove_tag_ids: list[int] = []


@router.post("/series/batch")
def batch_series(body: BatchBody, session: Session = Depends(get_session)):
    for sid in body.ids:
        s = session.get(Series, sid)
        if s is None:
            continue
        if body.is_favorite is not None:
            s.is_favorite = body.is_favorite
        if body.status is not None:
            s.user_status = body.status
        if body.read_status is not None:
            for v in session.exec(select(Volume).where(Volume.series_id == sid)).all():
                v.read_status = body.read_status
                session.add(v)
        existing = set(session.exec(select(SeriesTag.tag_id).where(SeriesTag.series_id == sid)).all())
        for tid in body.add_tag_ids:
            if tid not in existing and session.get(Tag, tid):
                session.add(SeriesTag(series_id=sid, tag_id=tid))
        for tid in body.remove_tag_ids:
            st = session.get(SeriesTag, (sid, tid))
            if st:
                session.delete(st)
        s.updated_at = now()
        session.add(s)
    session.commit()
    return {"ok": True, "count": len(body.ids)}


# ---------------------------------------------------------------- volumes

def _volume_or_404(session: Session, volume_id: int) -> Volume:
    v = session.get(Volume, volume_id)
    if v is None:
        raise HTTPException(404, "找不到此集數")
    return v


@router.patch("/volumes/{volume_id}")
def patch_volume(volume_id: int, body: ReadBody, session: Session = Depends(get_session)):
    v = _volume_or_404(session, volume_id)
    v.read_status = body.read_status
    session.add(v)
    session.commit()
    return {"ok": True, "read_status": v.read_status}


def _open(session: Session, v: Volume) -> dict:
    try:
        open_in_sumatra(abs_path(v.rel_path))
    except (LaunchError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    if v.read_status == "unread":
        v.read_status = "reading"
    v.last_opened_at = now()
    session.add(v)
    session.commit()
    return {"ok": True, "volume_id": v.id, "read_status": v.read_status}


@router.post("/volumes/{volume_id}/open")
def open_volume(volume_id: int, session: Session = Depends(get_session)):
    return _open(session, _volume_or_404(session, volume_id))


@router.post("/volumes/{volume_id}/reveal")
def reveal_volume(volume_id: int, session: Session = Depends(get_session)):
    v = _volume_or_404(session, volume_id)
    try:
        reveal_in_explorer(abs_path(v.rel_path))
    except (LaunchError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    return {"ok": True}


@router.post("/series/{series_id}/continue")
def continue_series(series_id: int, session: Session = Depends(get_session)):
    """Open the first volume that is 'reading', else the first 'unread', else the first volume."""
    _series_or_404(session, series_id)
    vols = session.exec(
        select(Volume).where(Volume.series_id == series_id, col(Volume.is_missing).is_(False)).order_by(Volume.sort_key)
    ).all()
    if not vols:
        raise HTTPException(404, "此系列沒有可開啟的檔案")
    target = next((v for v in vols if v.read_status == "reading"), None) \
        or next((v for v in vols if v.read_status == "unread"), None) or vols[0]
    return _open(session, target)


# ---------------------------------------------------------------- tags

class TagBody(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = "slate"


@router.get("/tags")
def list_tags(session: Session = Depends(get_session)):
    rows = session.exec(text("""
        SELECT t.id, t.name, t.color, COUNT(st.series_id) AS series_count
        FROM tag t LEFT JOIN seriestag st ON st.tag_id = t.id
        GROUP BY t.id ORDER BY t.name
    """)).all()  # type: ignore[call-overload]
    return [dict(r._mapping) for r in rows]


@router.post("/tags")
def create_tag(body: TagBody, session: Session = Depends(get_session)):
    name = body.name.strip()
    existing = session.exec(select(Tag).where(Tag.name == name)).first()
    if existing:
        return existing
    t = Tag(name=name, color=body.color)
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


@router.patch("/tags/{tag_id}")
def update_tag(tag_id: int, body: TagBody, session: Session = Depends(get_session)):
    t = session.get(Tag, tag_id)
    if t is None:
        raise HTTPException(404, "找不到此標籤")
    clash = session.exec(select(Tag).where(Tag.name == body.name.strip(), Tag.id != tag_id)).first()
    if clash:
        raise HTTPException(400, "已有同名標籤，請使用合併功能")
    t.name, t.color = body.name.strip(), body.color
    session.add(t)
    session.commit()
    return t


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int, session: Session = Depends(get_session)):
    t = session.get(Tag, tag_id)
    if t is None:
        raise HTTPException(404, "找不到此標籤")
    for st in session.exec(select(SeriesTag).where(SeriesTag.tag_id == tag_id)).all():
        session.delete(st)
    session.delete(t)
    session.commit()
    return {"ok": True}


class MergeBody(BaseModel):
    into_id: int


@router.post("/tags/{tag_id}/merge")
def merge_tag(tag_id: int, body: MergeBody, session: Session = Depends(get_session)):
    src, dst = session.get(Tag, tag_id), session.get(Tag, body.into_id)
    if src is None or dst is None or src.id == dst.id:
        raise HTTPException(400, "無效的標籤")
    have = set(session.exec(select(SeriesTag.series_id).where(SeriesTag.tag_id == dst.id)).all())
    for st in session.exec(select(SeriesTag).where(SeriesTag.tag_id == src.id)).all():
        if st.series_id not in have:
            session.add(SeriesTag(series_id=st.series_id, tag_id=dst.id))
        session.delete(st)
    session.delete(src)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------- helpers used by system router

def category_names(session: Session) -> dict[int, str]:
    return {c.id: c.display_name for c in session.exec(select(Category)).all()}  # type: ignore[misc]
