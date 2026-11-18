"""Application settings, loaded from the project-root .env file."""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("COMICS_DATA_DIR") or PROJECT_ROOT / "data")  # overridable for tests
COVERS_DIR = DATA_DIR / "covers"
DB_PATH = DATA_DIR / "library.db"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

_SUMATRA_CANDIDATES = [
    Path(os.environ.get("LOCALAPPDATA", "")) / "SumatraPDF" / "SumatraPDF.exe",
    Path(r"C:\Program Files\SumatraPDF\SumatraPDF.exe"),
    Path(r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe"),
]
_SEVENZIP_CANDIDATES = [
    Path(r"C:\Program Files\7-Zip\7z.exe"),
    Path(r"C:\Program Files (x86)\7-Zip\7z.exe"),
]


def _first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if str(p) and p.is_file():
            return p
    return None


def _bool(v: str | None, default: bool) -> bool:
    if v is None or v.strip() == "":
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    comics_root: Path
    sumatra_path: Path | None
    sevenzip_path: Path | None
    port: int
    category_map: list[tuple[str, str]]  # (folder_name, display_name), ordered
    file_types: set[str] = field(default_factory=set)
    scan_on_startup: bool = True

    @property
    def comics_root_ok(self) -> bool:
        return self.comics_root.is_dir()


def load_settings() -> Settings:
    load_dotenv(PROJECT_ROOT / ".env", override=True)

    cat_raw = os.getenv("CATEGORY_MAP", "HK:香港,Japan:日本,TW:台灣,US:美國")
    categories: list[tuple[str, str]] = []
    for item in cat_raw.split(","):
        if not item.strip():
            continue
        folder, _, display = item.partition(":")
        categories.append((folder.strip(), (display or folder).strip()))

    types = {
        t.strip().lower().lstrip(".")
        for t in os.getenv("FILE_TYPES", "pdf,epub,zip,cbz,rar,cbr,7z,mobi").split(",")
        if t.strip()
    }

    sumatra_env = os.getenv("SUMATRA_PATH", "").strip()
    sumatra = Path(sumatra_env) if sumatra_env else _first_existing(_SUMATRA_CANDIDATES)

    sevenzip_env = os.getenv("SEVENZIP_PATH", "").strip()
    sevenzip = Path(sevenzip_env) if sevenzip_env else _first_existing(_SEVENZIP_CANDIDATES)
    if sevenzip is None and shutil.which("7z"):
        sevenzip = Path(shutil.which("7z"))  # type: ignore[arg-type]

    return Settings(
        comics_root=Path(os.getenv("COMICS_ROOT", r"G:\Comics").strip()),
        sumatra_path=sumatra,
        sevenzip_path=sevenzip,
        port=int(os.getenv("PORT", "8000")),
        category_map=categories,
        file_types=types,
        scan_on_startup=_bool(os.getenv("SCAN_ON_STARTUP"), True),
    )


settings = load_settings()
