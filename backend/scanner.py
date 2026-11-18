"""Walks COMICS_ROOT and syncs Category → Series → Volume into the DB.

Read-only on the comics folder. Never deletes DB rows; vanished files are flagged is_missing
so user data (ratings, read status, tags) survives temporary drive/folder changes.
"""
from __future__ import annotations

import logging
import os
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path

from sqlmodel import Session, select

from .config import settings
from .db import engine
from .models import Category, ScanLog, Series, Volume, now
from .parser import loose_title, natural_key_str, parse_series_name, parse_volume, split_ext

log = logging.getLogger(__name__)


# ---------------------------------------------------------------- progress state

@dataclass
class ScanState:
    running: bool = False
    phase: str = "idle"  # idle | walking | syncing | done | error
    found: int = 0
    processed: int = 0
    total: int = 0
    message: str = ""
    last_log_id: int | None = None
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "running": self.running, "phase": self.phase, "found": self.found,
            "processed": self.processed, "total": self.total, "message": self.message,
            "last_log_id": self.last_log_id, "errors": self.errors[-20:],
        }


state = ScanState()
_lock = threading.Lock()


# ---------------------------------------------------------------- discovery

@dataclass
class FoundFile:
    rel_path: str
    file_name: str
    ext: str
    size: int
    mtime: float


@dataclass
class FoundSeries:
    rel_path: str  # folder path, or '<container>/*<title>' for a group of loose files
    folder_name: str  # name to parse for title/author/etc.
    group_name: str | None  # top-level author/collection folder, if any
    files: list[FoundFile] = field(default_factory=list)


@dataclass
class Node:
    path: str
    name: str
    files: list[FoundFile]
    children: list["Node"]
    total: int = 0  # comic files in this subtree

    def all_files(self) -> list[FoundFile]:
        out = list(self.files)
        for c in self.children:
            out.extend(c.all_files())
        return out


def _rel(p: str, root: str) -> str:
    return os.path.relpath(p, root).replace("\\", "/")


def _comic_file(entry: os.DirEntry, root: str) -> FoundFile | None:
    _stem, ext, part = split_ext(entry.name)
    if ext not in settings.file_types or (part is not None and part > 1):
        return None
    try:
        st = entry.stat()
    except OSError as e:  # pragma: no cover - IO edge
        state.errors.append(f"{entry.path}: {e}")
        return None
    state.found += 1
    return FoundFile(_rel(entry.path, root), entry.name, ext, st.st_size, st.st_mtime)


def _scan_dir(path: str) -> tuple[list[os.DirEntry], list[os.DirEntry]]:
    files, dirs = [], []
    try:
        with os.scandir(path) as it:
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False):
                        dirs.append(e)
                    elif e.is_file(follow_symlinks=False):
                        files.append(e)
                except OSError:
                    continue
    except OSError as e:
        state.errors.append(f"{path}: {e}")
    return files, dirs


def build_tree(path: str, name: str, root: str) -> Node:
    files, dirs = _scan_dir(path)
    node = Node(path, name, [ff for f in files if (ff := _comic_file(f, root))], [])
    node.children = [c for d in dirs if (c := build_tree(d.path, d.name, root)).total]
    node.total = len(node.files) + sum(c.total for c in node.children)
    return node


_VOLUME_DIR_NOISE = re.compile(r"(?i)vol(?:ume)?|part|第|卷|集|話|话|冊|册|部|期|[一二三四五六七八九十]|[\d\s._\-~～、,()（）\[\]【】]+")


# Folder names that only describe a format/edition, e.g. 'ePub', 'PDF格式', 'MOBI格式', 'Source', '大然版本'.
_GENERIC_DIR_RE = re.compile(
    r"(?i)^(?:[\s_\-()（）\[\]]|kepub|epub|pdf|mobi|azw3?|zip|rar|7z|cbz|cbr|jpg|png|source|src|"
    r"格式|版本|版|電子|电子|檔|档|高清|彩色|全彩|大然|東立|东立|尖端|玉皇朝|文庫|文库|新裝|豪華|典藏)+$"
)


def is_generic_dir(name: str) -> bool:
    return bool(_GENERIC_DIR_RE.match(name.strip()))


def looks_like_single_series(children: list[Node]) -> bool:
    """Children are volumes ('Vol_01, Vol_02…', '000-100, 101-200', 'X 01-20, X 21-50')
    or format variants ('ePub', 'PDF格式', 'MOBI格式') of one series."""
    if len(children) < 2:
        return True
    if all(is_generic_dir(c.name) for c in children):
        return True
    return len({_VOLUME_DIR_NOISE.sub("", c.name).lower() for c in children}) == 1


def _loose_groups(files: list[FoundFile]) -> dict[str, list[FoundFile]]:
    groups: dict[str, list[FoundFile]] = {}
    for f in files:
        groups.setdefault(loose_title(f.file_name), []).append(f)
    return groups


def classify(node: Node, root: str, group: str | None, out: list[FoundSeries], parent: str | None = None) -> None:
    if looks_like_single_series(node.children):
        # A generic folder name ('ePub', 'PDF版') is not a title — use the parent folder's name.
        name = parent if parent and is_generic_dir(node.name) else node.name
        out.append(FoundSeries(_rel(node.path, root), name, group, node.all_files()))
        return
    # Author / collection folder: loose files grouped by title, each child classified recursively.
    g = group or node.name
    rel = _rel(node.path, root)
    for title, fs in _loose_groups(node.files).items():
        out.append(FoundSeries(f"{rel}/*{title}", title, g, fs))
    title_ctx = parent if is_generic_dir(node.name) and parent else node.name
    for c in node.children:
        classify(c, root, g, out, title_ctx)


def discover_category(cat_dir: str, root: str) -> list[FoundSeries]:
    result: list[FoundSeries] = []
    files, dirs = _scan_dir(cat_dir)
    loose = [ff for f in files if (ff := _comic_file(f, root))]
    rel = _rel(cat_dir, root)
    for title, fs in _loose_groups(loose).items():
        result.append(FoundSeries(f"{rel}/*{title}", title, None, fs))
    for d in dirs:
        node = build_tree(d.path, d.name, root)
        if node.total:
            classify(node, root, None, result)
    return result


# ---------------------------------------------------------------- sync

def _apply_series_parse(s: Series, fs: FoundSeries) -> None:
    info = parse_series_name(fs.folder_name)
    s.folder_name = fs.folder_name
    s.group_name = fs.group_name
    s.auto_title = info.title
    # A parent folder is likely the author unless it is a franchise name (e.g. 天子傳奇 → 天子傳奇8).
    group_author = fs.group_name if fs.group_name and fs.group_name not in fs.folder_name else None
    s.auto_author = info.author or group_author
    s.auto_publisher = info.publisher or s.auto_publisher
    s.auto_status = info.status if info.status != "unknown" else (s.auto_status or "unknown")
    s.auto_total_volumes = info.total_volumes or s.auto_total_volumes


def run_scan(mode: str = "incremental") -> None:
    if not _lock.acquire(blocking=False):
        return
    state.__init__()  # reset
    state.running, state.phase = True, "walking"
    root = str(settings.comics_root)
    with Session(engine) as session:
        scan_log = ScanLog(mode=mode)
        session.add(scan_log)
        session.commit()
        state.last_log_id = scan_log.id
    try:
        if not settings.comics_root_ok:
            raise RuntimeError(f"找不到漫畫資料夾：{root}，請檢查 .env 的 COMICS_ROOT")

        with Session(engine) as session:
            categories = session.exec(select(Category)).all()
        found: list[tuple[int, FoundSeries]] = []
        for cat in categories:
            cat_dir = os.path.join(root, cat.folder_name)
            if not os.path.isdir(cat_dir):
                continue
            state.message = f"掃描 {cat.display_name}…"
            found.extend((cat.id, fs) for fs in discover_category(cat_dir, root))  # type: ignore[misc]

        state.phase, state.total = "syncing", len(found)
        state.message = "更新資料庫…"
        added, updated, missing = _sync(found, full=(mode == "full"))

        with Session(engine) as session:
            sl = session.get(ScanLog, state.last_log_id)
            if sl:
                sl.finished_at, sl.added, sl.updated, sl.missing = now(), added, updated, missing
                sl.errors = len(state.errors)
                sl.message = "完成"
                session.add(sl)
                session.commit()
        state.phase = "done"
        state.message = f"完成：新增 {added}、更新 {updated}、遺失 {missing}"
    except Exception as e:  # noqa: BLE001
        log.exception("scan failed")
        state.phase, state.message = "error", str(e)
        with Session(engine) as session:
            sl = session.get(ScanLog, state.last_log_id)
            if sl:
                sl.finished_at, sl.message, sl.errors = now(), str(e), len(state.errors) + 1
                session.add(sl)
                session.commit()
    finally:
        state.running = False
        _lock.release()
    # Kick off background cover generation for series covers.
    from . import covers

    covers.start_worker()


def _sync(found: list[tuple[int, FoundSeries]], full: bool) -> tuple[int, int, int]:
    added = updated = 0
    with Session(engine) as session:
        series_by_path = {s.rel_path: s for s in session.exec(select(Series)).all()}
        vols_by_path = {v.rel_path: v for v in session.exec(select(Volume)).all()}
        seen_series: set[int] = set()
        seen_paths: set[str] = set()

        for i, (cat_id, fs) in enumerate(found):
            s = series_by_path.get(fs.rel_path)
            if s is None:
                s = Series(category_id=cat_id, rel_path=fs.rel_path, folder_name=fs.folder_name, auto_title="")
                _apply_series_parse(s, fs)
                session.add(s)
                session.flush()
                series_by_path[fs.rel_path] = s
            else:
                s.category_id = cat_id
                _apply_series_parse(s, fs)
                s.is_missing = False
            seen_series.add(s.id)  # type: ignore[arg-type]

            for ff in fs.files:
                v = vols_by_path.get(ff.rel_path)
                vi = parse_volume(ff.file_name)
                if v is None:
                    v = Volume(
                        series_id=s.id, rel_path=ff.rel_path, file_name=ff.file_name, ext=ff.ext,  # type: ignore[arg-type]
                        size_bytes=ff.size, mtime=ff.mtime, volume_label=vi.label, volume_no=vi.number,
                        sort_key=natural_key_str(ff.rel_path),
                    )
                    session.add(v)
                    vols_by_path[ff.rel_path] = v
                    added += 1
                else:
                    changed = v.size_bytes != ff.size or abs(v.mtime - ff.mtime) > 1
                    if changed:
                        v.size_bytes, v.mtime, v.cover_state = ff.size, ff.mtime, "pending"
                        updated += 1
                    if changed or full or v.is_missing or v.series_id != s.id:
                        v.series_id, v.volume_label, v.volume_no = s.id, vi.label, vi.number  # type: ignore[assignment]
                        v.sort_key = natural_key_str(ff.rel_path)
                    v.is_missing = False
                seen_paths.add(ff.rel_path)
            state.processed = i + 1
            if i % 200 == 0:
                session.flush()

        missing = 0
        for v in vols_by_path.values():
            if v.rel_path not in seen_paths and not v.is_missing:
                v.is_missing = True
                missing += 1
        for s in series_by_path.values():
            if s.id not in seen_series:
                s.is_missing = True
        session.commit()
    return added, updated, missing


def start_scan(mode: str = "incremental") -> bool:
    if state.running:
        return False
    threading.Thread(target=run_scan, args=(mode,), daemon=True, name="scanner").start()
    return True


def abs_path(rel_path: str) -> Path:
    """Resolve a DB rel_path to an absolute path, guaranteeing it stays inside COMICS_ROOT."""
    root = settings.comics_root.resolve()
    p = (root / Path(rel_path)).resolve()
    if not p.is_relative_to(root):
        raise ValueError("path outside COMICS_ROOT")
    return p
