"""Database models.

Series keeps auto-parsed values (auto_*) and user overrides (user_*) side by side.
The scanner only ever writes auto_* columns; displayed value = user_* if set, else auto_*.
All file paths are stored relative to COMICS_ROOT (POSIX-style '/').
"""
from __future__ import annotations

from datetime import datetime

from pydantic import NaiveDatetime
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    folder_name: str = Field(index=True, unique=True)
    display_name: str
    sort_order: int = 0


class Series(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="category.id", index=True)
    rel_path: str = Field(index=True, unique=True)
    folder_name: str
    group_name: str | None = None  # parent "author/collection" folder, if any

    auto_title: str
    auto_author: str | None = None
    auto_publisher: str | None = None
    auto_status: str = "unknown"
    auto_total_volumes: int | None = None
    auto_summary: str | None = None

    user_title: str | None = None
    user_original_title: str | None = None
    user_author: str | None = None
    user_publisher: str | None = None
    user_status: str | None = None
    user_total_volumes: int | None = None
    user_summary: str | None = None

    notes: str | None = None
    rating: int | None = None  # 1..5
    is_favorite: bool = False
    cover_volume_id: int | None = None  # user-chosen cover

    is_missing: bool = False
    created_at: NaiveDatetime = Field(default_factory=now)
    updated_at: NaiveDatetime = Field(default_factory=now)


class Volume(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    series_id: int = Field(foreign_key="series.id", index=True)
    rel_path: str = Field(index=True, unique=True)
    file_name: str
    ext: str = Field(index=True)
    size_bytes: int = 0
    mtime: float = 0
    volume_label: str = ""
    volume_no: float | None = None
    sort_key: str = ""
    read_status: str = "unread"  # unread | reading | read
    last_opened_at: NaiveDatetime | None = None
    cover_state: str = "pending"  # pending | ok | failed
    is_missing: bool = False
    added_at: NaiveDatetime = Field(default_factory=now, index=True)


class Tag(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    color: str = "slate"


class SeriesTag(SQLModel, table=True):
    series_id: int = Field(foreign_key="series.id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.id", primary_key=True)


class ScanLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    mode: str = "incremental"
    started_at: NaiveDatetime = Field(default_factory=now)
    finished_at: NaiveDatetime | None = None
    added: int = 0
    updated: int = 0
    missing: int = 0
    errors: int = 0
    message: str | None = None
