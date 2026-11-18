from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

from .config import DATA_DIR, DB_PATH, settings

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH.as_posix()}",
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(engine)
    sync_categories()


def sync_categories() -> None:
    """Make the Category table mirror CATEGORY_MAP in .env (display names and order)."""
    from .models import Category

    with Session(engine) as s:
        existing = {c.folder_name: c for c in s.exec(select(Category)).all()}
        for order, (folder, display) in enumerate(settings.category_map):
            c = existing.get(folder)
            if c is None:
                s.add(Category(folder_name=folder, display_name=display, sort_order=order))
            else:
                c.display_name, c.sort_order = display, order
        s.commit()


def get_session() -> Iterator[Session]:
    with Session(engine) as s:
        yield s
