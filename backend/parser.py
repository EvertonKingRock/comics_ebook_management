"""Pure filename / folder-name parsing. No I/O here — keep it unit-testable."""
from __future__ import annotations

import re
from dataclasses import dataclass

# ---------------------------------------------------------------- constants

TOKEN_RE = re.compile(r"[\[【［]([^\]】］]*)[\]】］]")

# Tokens that describe the comic's origin/kind — dropped from title/author.
KIND_TOKENS = {
    "港漫", "日漫", "台漫", "美漫", "韓漫", "国漫", "國漫", "漫畫", "漫画", "comic", "comics",
    "汉化", "漢化", "中文", "繁體", "繁体", "简体", "簡體", "掃圖", "扫图", "高清", "全彩", "ai全彩",
    "pdf", "jpg", "epub", "png", "mobi", "彩色", "黑白",
}
# Tokens that are clearly release-group / source / website noise.
NOISE_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"^kmoe$", r"^kox$", r"^vol\.moe$", r"^mox", r"伊莉", r"分享", r"獨家", r"独家", r"\.com", r"\.net",
        r"tvboxnow", r"^\d{3,5}\s*[x×*]\s*\d{3,5}$", r"^\d+(\.\d+)?\s*[gm]b?$", r"^c\.c$", r"小良家族",
        r"^dl$", r"下载|下載", r"^v\d+$", r"合集", r"^完整版$", r"高清",
    ]
]
EDITION_TOKENS = {"中漫版", "港版", "台版", "日版", "繁中版", "原版", "修正版"}
KNOWN_PUBLISHERS = {
    "玉皇朝", "文化傳信", "文化传信", "天下出版", "天下", "東立", "东立", "尖端", "青文", "長鴻", "长鸿",
    "自由人", "海豹", "港青", "鼎龍", "鼎龙", "大然", "時報", "时报", "台灣東販", "東販", "角川", "台灣角川",
    "傳信", "玉郎", "博益", "天下出版有限公司", "火鳳凰", "旭力", "利文", "新雅", "Marvel", "DC",
}

FINISHED_RE = re.compile(
    r"(\d+)\s*[集卷冊册話话]?\s*(?:全)?\s*完(?!全)(?:結|结)?|完結|完结|^完$|[（(]完(?:結|结)?(?:[）)]|$)|全(\d+)[集卷冊册]"
)
ONGOING_RE = re.compile(r"連載|连载|未完")

ARCHIVE_PART_RE = re.compile(r"\.part(\d+)$", re.I)
MULTI_EXT = (".kepub.epub",)

# Volume markers: (regex, label kind). Ordered by specificity.
NUM = r"0*(\d+)(?:\s*[-~～－至]\s*0*(\d+))?"
VOLUME_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"第\s*" + NUM + r"\s*卷"), "卷"),
    (re.compile(r"第\s*" + NUM + r"\s*[集]"), "集"),
    (re.compile(r"第\s*" + NUM + r"\s*[話话]"), "話"),
    (re.compile(r"第\s*" + NUM + r"\s*[回]"), "回"),
    (re.compile(r"第\s*" + NUM + r"\s*[冊册部期]"), "冊"),
    (re.compile(r"卷\s*" + NUM), "卷"),
    (re.compile(r"[話话]\s*" + NUM), "話"),
    (re.compile(r"(?<![a-z])vol(?:ume)?\s*[._\-]?\s*" + NUM, re.I), "Vol"),
    (re.compile(r"(?<![a-z])ch(?:apter)?\s*[._\-]?\s*" + NUM, re.I), "話"),
    (re.compile(r"#\s*" + NUM), "#"),
    (re.compile(NUM + r"\s*卷"), "卷"),
    (re.compile(NUM + r"\s*集"), "集"),
    (re.compile(NUM + r"\s*[話话]"), "話"),
    (re.compile(NUM + r"\s*回"), "回"),
    (re.compile(NUM + r"\s*[冊册期]"), "冊"),
]
BARE_NUM_RE = re.compile(r"(?<![\d.])" + NUM + r"(?![\d.])")
SPECIAL_VOLUME_RE = re.compile(r"全一[冊册卷集]|[上中下][冊册卷集]|上篇|中篇|下篇|前篇|後篇|后篇|番外|特別篇|特别篇|外傳|外传|上\s*\+\s*下")


# ---------------------------------------------------------------- helpers

def natural_key(s: str) -> list:
    """Sort key that orders 'vol2' before 'vol10'."""
    return [(0, int(t), "") if t.isdigit() else (1, 0, t.lower()) for t in re.split(r"(\d+)", s) if t]


def natural_key_str(s: str) -> str:
    """String form of natural_key, storable in SQLite and sortable lexicographically."""
    return "".join(t.zfill(8) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s))


def split_ext(file_name: str) -> tuple[str, str, int | None]:
    """Return (stem, ext, part_no). ext is lower-case without dot ('kepub.epub' → 'epub')."""
    lower = file_name.lower()
    for mext in MULTI_EXT:
        if lower.endswith(mext):
            return file_name[: -len(mext)], mext.rsplit(".", 1)[-1], None
    stem, dot, ext = file_name.rpartition(".")
    if not dot:
        return file_name, "", None
    part = None
    m = ARCHIVE_PART_RE.search(stem)
    if m:
        part = int(m.group(1))
        stem = stem[: m.start()]
    return stem, ext.lower(), part


def _is_noise(tok: str) -> bool:
    t = tok.strip()
    if not t:
        return True
    if t.lower() in KIND_TOKENS:
        return True
    return any(p.search(t) for p in NOISE_PATTERNS)


def _clean(s: str) -> str:
    s = re.sub(r"\s+by\s+\S+.*$", "", s, flags=re.I)  # 'IpMan-01 by 11wolves_TVBOXNOW.com'
    s = re.sub(r"(?i)(?<![a-z])(pdf|jpg|epub|mobi|png)$", "", s.strip())
    s = re.sub(r"\s*\d+(\.\d+)?\s*[GM]B?$", "", s, flags=re.I)  # '19.9G'
    s = re.sub(r"\s*高清\s*", " ", s)
    return s.strip(" _-·.　")


# ---------------------------------------------------------------- series

@dataclass
class SeriesInfo:
    title: str
    author: str | None = None
    publisher: str | None = None
    status: str = "unknown"  # ongoing | finished | stopped | unknown
    total_volumes: int | None = None


def parse_status(text: str) -> tuple[str | None, int | None]:
    m = FINISHED_RE.search(text)
    if m:
        n = m.group(1) or m.group(2)
        return "finished", int(n) if n else None
    if ONGOING_RE.search(text):
        return "ongoing", None
    return None, None


def parse_series_name(name: str) -> SeriesInfo:
    tokens = [t.strip() for t in TOKEN_RE.findall(name)]
    rest = _clean(TOKEN_RE.sub(" ", name))

    status, total = None, None
    meaningful: list[str] = []
    publisher: str | None = None
    for tok in tokens:
        st, n = parse_status(tok)
        if st and len(tok) <= 8:
            status, total = st, n or total
            continue
        if _is_noise(tok) or tok in EDITION_TOKENS or re.fullmatch(r"上篇\s*\+\s*下篇|[\d\s\-~]+", tok):
            continue
        if tok in KNOWN_PUBLISHERS and publisher is None:
            publisher = tok
            continue
        meaningful.append(tok)

    # Status may also hide in the free text, e.g. 'XXX(完)' or 'XXX 22完'
    if status is None:
        st, n = parse_status(rest)
        if st:
            status, total = st, n
            rest = _clean(FINISHED_RE.sub("", rest))
    rest = re.sub(r"[（(]\s*[）)]$", "", rest).strip()
    # A bare volume count like '48集' / '36卷' is a total, not a title.
    m = re.fullmatch(r"(?:全)?\s*(\d+)\s*[集卷冊册話话期]", rest)
    if m:
        total = total or int(m.group(1))
        rest = ""

    author = None
    if rest:
        title = rest
    elif meaningful:
        title = meaningful[0]
        if len(meaningful) > 1:
            author = meaningful[1]
        if len(meaningful) > 2 and publisher is None:
            publisher = meaningful[2]
    else:
        title = _clean(name) or name

    return SeriesInfo(title=title, author=author, publisher=publisher,
                      status=status or "unknown", total_volumes=total)


# ---------------------------------------------------------------- volumes

@dataclass
class VolumeInfo:
    label: str
    number: float | None  # for sorting; None when unknown


def _fmt(kind: str, a: str, b: str | None) -> str:
    rng = f"{int(a):02d}" + (f"–{int(b):02d}" if b else "")
    if kind == "Vol":
        return f"Vol.{rng}"
    if kind == "#":
        return f"#{rng}"
    if kind in {"卷", "集", "話", "回", "冊"}:
        return f"第 {rng} {kind}"
    return rng


def parse_volume(file_name: str) -> VolumeInfo:
    stem, _ext, part = split_ext(file_name)
    remainder = TOKEN_RE.sub(" ", stem).strip()
    search_space = remainder or stem

    for rx, kind in VOLUME_PATTERNS:
        m = rx.search(search_space)
        if m:
            return VolumeInfo(_fmt(kind, m.group(1), m.group(2)), float(m.group(1)))

    sp = SPECIAL_VOLUME_RE.search(search_space)
    if sp:
        order = {"上": 1, "前": 1, "中": 2, "下": 3, "後": 3, "后": 3}.get(sp.group(0)[0], 0)
        return VolumeInfo(sp.group(0), float(order))

    nums = list(BARE_NUM_RE.finditer(search_space))
    if nums:
        m = nums[-1]
        return VolumeInfo(_fmt("", m.group(1), m.group(2)), float(m.group(1)))

    fallback = _clean(remainder) or " ".join(t for t in TOKEN_RE.findall(stem) if not _is_noise(t)) or stem
    return VolumeInfo(fallback, None)


_VOL_SUFFIX_RE = re.compile(
    r"[_\-\s]*(?:第|vol(?:ume)?[._]?|卷|話|话)?\s*\d+(?:\s*[-~～]\s*\d+)?\s*(?:話|话|集|卷|回|冊|册)?$", re.I
)


def strip_volume_suffix(title: str) -> str:
    """'Furinkazan_01-03' → 'Furinkazan', '脫北者_第001-003話' → '脫北者'. Keeps the title if nothing remains."""
    out = _VOL_SUFFIX_RE.sub("", title).strip(" _-")
    return out or title


def loose_title(file_name: str) -> str:
    """Series title for a loose file, used to group loose files into series.

    '[Kox][霸刀]話001-010.kepub.epub' → '霸刀', 'Nine_Vol.01-03.rar' → 'Nine'.
    """
    stem = split_ext(file_name)[0]
    tokens = [t.strip() for t in TOKEN_RE.findall(stem) if not _is_noise(t) and t.strip() not in EDITION_TOKENS]
    tokens = [t for t in tokens if not parse_status(t)[0] and t not in KNOWN_PUBLISHERS]
    if tokens:
        return tokens[0]
    rest = _clean(TOKEN_RE.sub(" ", stem))
    return strip_volume_suffix(rest) or stem
