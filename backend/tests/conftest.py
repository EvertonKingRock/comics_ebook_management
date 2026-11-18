"""Test setup: isolated data dir + a small fake comics tree. Must run before backend modules import."""
import io
import os
import tempfile
import zipfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="comics_test_"))
os.environ["COMICS_DATA_DIR"] = str(_TMP / "data")

import pytest  # noqa: E402


def _png_bytes() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (60, 90), (200, 30, 30)).save(buf, "PNG")
    return buf.getvalue()


def _make_pdf(path: Path) -> None:
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=300, height=450)
    page.insert_text((50, 100), "cover")
    doc.save(path)


def _make_epub(path: Path) -> None:
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml",
                   '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                   '<rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
        z.writestr("OEBPS/content.opf",
                   '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">'
                   '<metadata><dc:title>ROUGH</dc:title><dc:creator>安達充</dc:creator><dc:description>游泳青春故事</dc:description>'
                   '<meta name="cover" content="c1"/></metadata>'
                   '<manifest><item id="c1" href="img/cover.png" media-type="image/png"/></manifest></package>')
        z.writestr("OEBPS/img/cover.png", _png_bytes())


@pytest.fixture(scope="session")
def comics_root() -> Path:
    root = _TMP / "Comics"
    hk = root / "HK" / "[港漫][皇朝傳奇][倫裕國][中漫版][22完]"
    hk.mkdir(parents=True)
    for i in (1, 2, 10):
        _make_pdf(hk / f"皇朝傳奇 第{i:02d}期.pdf")
    rough = root / "Japan" / "安達充" / "ROUGH"
    rough.mkdir(parents=True)
    _make_epub(rough / "[Kmoe][ROUGH]卷01.epub")
    h2 = root / "Japan" / "安達充" / "H2"
    h2.mkdir(parents=True)
    with zipfile.ZipFile(h2 / "H2_Vol.01.zip", "w") as z:
        z.writestr("002.png", _png_bytes())
        z.writestr("001.png", _png_bytes())
    (root / "Japan" / "Furinkazan_01-03.pdf").write_bytes(b"%PDF-1.4 broken")
    # loose files inside an author folder → grouped into their own series
    (root / "Japan" / "安達充" / "Nine_Vol.01-03.rar").write_bytes(b"not really a rar")
    # volume sub-folders → one series
    for i in (1, 2):
        vd = root / "HK" / "[天煞狂刀][港漫]48集" / f"Vol_{i:02d}"
        vd.mkdir(parents=True)
        _make_pdf(vd / f"天煞狂刀{i:02d}.pdf")
    (root / "Japan" / "BLUE GIANT").mkdir()
    (root / "Japan" / "BLUE GIANT" / "readme.txt").write_text("not a comic")
    (root / "TW").mkdir()
    (root / "US").mkdir()
    return root


@pytest.fixture(scope="session")
def client(comics_root):
    from fastapi.testclient import TestClient

    from backend import scanner
    from backend.config import settings
    from backend.main import app

    settings.comics_root = comics_root
    settings.scan_on_startup = False
    with TestClient(app) as c:
        scanner.run_scan("full")
        yield c
