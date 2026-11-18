"""Cover thumbnail extraction (read-only on comic files) → data/covers/{volume_id}.webp."""
from __future__ import annotations

import io
import logging
import posixpath
import re
import subprocess
import tempfile
import threading
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from PIL import Image
from sqlmodel import Session, col, select

from .config import COVERS_DIR, settings
from .db import engine
from .models import Series, Volume
from .parser import natural_key

log = logging.getLogger(__name__)
COVERS_DIR.mkdir(parents=True, exist_ok=True)

THUMB_WIDTH = 360
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")
CREATE_NO_WINDOW = 0x08000000
_gen_lock = threading.Lock()


def cover_path(volume_id: int) -> Path:
    return COVERS_DIR / f"{volume_id}.webp"


def _save_thumb(data: bytes | Image.Image, out: Path) -> None:
    img = data if isinstance(data, Image.Image) else Image.open(io.BytesIO(data))
    img.draft("RGB", (THUMB_WIDTH * 2, THUMB_WIDTH * 3))  # fast JPEG downscale
    img = img.convert("RGB")
    if img.width > THUMB_WIDTH:
        img = img.resize((THUMB_WIDTH, round(img.height * THUMB_WIDTH / img.width)), Image.Resampling.LANCZOS)
    tmp = out.with_suffix(f".{threading.get_ident()}.tmp")  # unique per thread
    img.save(tmp, "WEBP", quality=82, method=4)
    tmp.replace(out)


def _is_image(name: str) -> bool:
    n = name.lower()
    return n.endswith(IMAGE_EXT) and "__macosx" not in n and not posixpath.basename(n).startswith(".")


# ---------------------------------------------------------------- per-format extractors

def _pdf(path: Path) -> Image.Image:
    import pymupdf

    with pymupdf.open(path) as doc:
        page = doc[0]
        zoom = (THUMB_WIDTH * 1.5) / max(page.rect.width, 1)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _epub(path: Path) -> tuple[bytes, dict]:
    meta: dict = {}
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        cover_name = None
        try:
            container = ET.fromstring(z.read("META-INF/container.xml"))
            opf_path = next(e.get("full-path") for e in container.iter() if e.tag.endswith("rootfile"))
            opf = ET.fromstring(z.read(opf_path))
            base = posixpath.dirname(opf_path)
            items = {e.get("id"): e for e in opf.iter() if e.tag.endswith("item")}
            for e in opf.iter():
                tag = e.tag.rsplit("}", 1)[-1]
                if tag == "creator" and e.text and "author" not in meta:
                    meta["author"] = e.text.strip()
                elif tag == "description" and e.text and "summary" not in meta:
                    meta["summary"] = re.sub(r"<[^>]+>", "", e.text).strip()
            cover_item = next((e for e in items.values() if "cover-image" in (e.get("properties") or "")), None)
            if cover_item is None:
                meta_cover = next((e.get("content") for e in opf.iter() if e.tag.endswith("meta") and e.get("name") == "cover"), None)
                cover_item = items.get(meta_cover) if meta_cover else None
            if cover_item is None:
                cover_item = next((e for i, e in items.items() if i and "cover" in i.lower() and (e.get("media-type") or "").startswith("image")), None)
            if cover_item is not None:
                cover_name = posixpath.normpath(posixpath.join(base, cover_item.get("href", "")))
        except (KeyError, StopIteration, ET.ParseError):
            pass
        if cover_name not in names:
            imgs = sorted((n for n in names if _is_image(n)), key=natural_key)
            cover_name = imgs[0] if imgs else None
        if not cover_name:
            raise ValueError("no image in epub")
        return z.read(cover_name), meta


def _zip(path: Path) -> bytes:
    with zipfile.ZipFile(path) as z:
        imgs = sorted((n for n in z.namelist() if _is_image(n)), key=natural_key)
        if not imgs:
            raise ValueError("no image in zip")
        return z.read(imgs[0])


ARCHIVE_EXT = (".zip", ".cbz", ".rar", ".cbr", ".7z", ".cb7")


def _run7z(args: list[str], timeout: int) -> subprocess.CompletedProcess:
    exe = settings.sevenzip_path
    if not exe:
        raise RuntimeError("7-Zip not found")
    return subprocess.run([str(exe), *args], capture_output=True, timeout=timeout, creationflags=CREATE_NO_WINDOW)


def _sevenzip(path: Path, depth: int = 0) -> bytes:
    """First image of a RAR/7Z (or ZIP) archive via the 7-Zip CLI.

    Tries no password first, then each ARCHIVE_PASSWORDS entry (many download-site archives
    share one, e.g. 'qwer'). If the archive only wraps other archives, looks one level inside.
    Reads only; inner archives are unpacked to a temp file under data/.
    """
    for pw in [None, *settings.archive_passwords]:
        pflag = "-p-" if pw is None else f"-p{pw}"
        listed = _run7z(["l", "-slt", "-ba", "-sccUTF-8", pflag, str(path)], 60)
        names = [ln[7:].strip() for ln in listed.stdout.decode("utf-8", "replace").splitlines() if ln.startswith("Path = ")]
        if not names:
            continue  # encrypted headers (or unreadable) — try the next password
        imgs = sorted((n for n in names if _is_image(n)), key=natural_key)
        if imgs:
            got = _run7z(["e", "-so", "-sccUTF-8", pflag, str(path), imgs[0]], 120)
            if got.returncode == 0 and got.stdout:
                return got.stdout
            continue  # encrypted contents and wrong password
        inner = sorted((n for n in names if n.lower().endswith(ARCHIVE_EXT)), key=natural_key)
        if inner and depth == 0:
            got = _run7z(["e", "-so", "-sccUTF-8", pflag, str(path), inner[0]], 600)
            if got.returncode != 0 or not got.stdout:
                continue
            tmp_dir = COVERS_DIR.parent / "tmp"
            tmp_dir.mkdir(exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=tmp_dir, suffix=Path(inner[0]).suffix, delete=False) as f:
                f.write(got.stdout)
                tmp = Path(f.name)
            try:
                return _sevenzip(tmp, depth + 1)
            finally:
                tmp.unlink(missing_ok=True)
        raise ValueError("no image in archive")
    raise ValueError("encrypted archive: no matching password in ARCHIVE_PASSWORDS")


def extract_cover(path: Path, ext: str, out: Path) -> dict:
    """Write a thumbnail for `path` to `out`. Returns any metadata found (EPUB)."""
    meta: dict = {}
    if ext == "pdf":
        _save_thumb(_pdf(path), out)
    elif ext == "epub":
        data, meta = _epub(path)
        _save_thumb(data, out)
    elif ext in ("zip", "cbz"):
        _save_thumb(_zip(path), out)
    elif ext in ("rar", "cbr", "7z", "cb7"):
        _save_thumb(_sevenzip(path), out)
    elif ext in ("mobi", "azw3", "fb2"):
        _save_thumb(_pdf(path), out)  # MuPDF renders e-book formats too
    else:
        raise ValueError(f"unsupported cover format: {ext}")
    return meta


def ensure_cover(volume_id: int) -> Path | None:
    """Generate (if needed) and return the cover path for a volume, or None on failure."""
    from .scanner import abs_path

    out = cover_path(volume_id)
    if out.exists():
        return out
    with Session(engine) as s:
        v = s.get(Volume, volume_id)
        if v is None or v.cover_state == "failed":
            return None
        try:
            meta = extract_cover(abs_path(v.rel_path), v.ext, out)
            v.cover_state = "ok"
            if meta:
                series = s.get(Series, v.series_id)
                if series:
                    if meta.get("summary") and not series.auto_summary:
                        series.auto_summary = meta["summary"][:2000]
                    s.add(series)
        except Exception as e:  # noqa: BLE001 - any broken file just gets a placeholder
            log.info("cover failed for %s: %s", v.rel_path, e)
            v.cover_state = "failed"
        s.add(v)
        s.commit()
        return out if out.exists() else None


# ---------------------------------------------------------------- background worker

MAX_COVER_TRIES = 4


def series_cover_candidates(session: Session) -> list[list[int]]:
    """Per series: the user's chosen cover, else its first few volumes in order (fallbacks when one fails)."""
    rows = session.exec(
        select(Volume.series_id, Volume.id).where(col(Volume.is_missing).is_(False)).order_by(Volume.series_id, Volume.sort_key)
    ).all()
    cands: dict[int, list[int]] = {}
    for sid, vid in rows:
        lst = cands.setdefault(sid, [])  # type: ignore[arg-type]
        if len(lst) < MAX_COVER_TRIES:
            lst.append(vid)  # type: ignore[arg-type]
    for sid, vid in session.exec(select(Series.id, Series.cover_volume_id).where(col(Series.cover_volume_id).is_not(None))).all():
        cands[sid] = [vid]  # type: ignore[index,list-item]
    return list(cands.values())


worker_state = {"running": False, "done": 0, "total": 0}


def _worker() -> None:
    try:
        with Session(engine) as s:
            groups = series_cover_candidates(s)
            state = dict(s.exec(select(Volume.id, Volume.cover_state)).all())
        # Series whose cover isn't settled yet: no candidate is 'ok' and at least one is still pending.
        todo = [g for g in groups if not any(state.get(v) == "ok" and cover_path(v).exists() for v in g)
                and any(state.get(v) == "pending" for v in g)]
        worker_state.update(running=True, done=0, total=len(todo))
        for g in todo:
            for vid in g:
                if ensure_cover(vid):
                    break
            worker_state["done"] += 1
    finally:
        worker_state["running"] = False
        _gen_lock.release()


def start_worker() -> bool:
    if not _gen_lock.acquire(blocking=False):
        return False
    threading.Thread(target=_worker, daemon=True, name="covers").start()
    return True


def reset_covers(failed_only: bool = False) -> None:
    with Session(engine) as s:
        q = select(Volume).where(Volume.cover_state == "failed") if failed_only else select(Volume)
        for v in s.exec(q).all():
            v.cover_state = "pending"
            s.add(v)
        s.commit()
    if not failed_only:
        for f in COVERS_DIR.glob("*.webp"):
            f.unlink(missing_ok=True)
