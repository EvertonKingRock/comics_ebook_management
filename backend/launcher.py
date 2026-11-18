"""Open comics in SumatraPDF or reveal them in Explorer. Never uses shell=True."""
from __future__ import annotations

import subprocess
from pathlib import Path

from .config import settings


class LaunchError(RuntimeError):
    pass


def open_in_sumatra(path: Path) -> None:
    exe = settings.sumatra_path
    if not exe or not Path(exe).is_file():
        raise LaunchError("找不到 SumatraPDF，請檢查 .env 的 SUMATRA_PATH")
    if not path.is_file():
        raise LaunchError(f"檔案不存在：{path}")
    subprocess.Popen([str(exe), str(path)], close_fds=True)


def reveal_in_explorer(path: Path) -> None:
    if not path.exists():
        raise LaunchError(f"檔案不存在：{path}")
    subprocess.Popen(["explorer.exe", "/select,", str(path)], close_fds=True)
