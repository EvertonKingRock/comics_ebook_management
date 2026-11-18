import pytest

from backend.parser import natural_key, parse_series_name, parse_volume, split_ext


@pytest.mark.parametrize(
    "name, title, author, publisher, status, total",
    [
        ("[港漫][皇朝傳奇][倫裕國][中漫版][22完]", "皇朝傳奇", "倫裕國", None, "finished", 22),
        ("[港漫][雪山飛狐 序章篇][何志文][文化傳信][中漫版][上篇+下篇]", "雪山飛狐 序章篇", "何志文", "文化傳信", "unknown", None),
        ("BLUE GIANT", "BLUE GIANT", None, None, "unknown", None),
        ("IpMan-01 by 11wolves_TVBOXNOW.com", "IpMan-01", None, None, "unknown", None),
        ("【春秋-战雄】 高清 19.9G", "春秋-战雄", None, None, "unknown", None),
        ("陰陽路[全彩][3250×4680]PDF", "陰陽路", None, None, "unknown", None),
        ("[汉化]天·天和街浪子", "天·天和街浪子", None, None, "unknown", None),
        ("中華小廚師(愛藏版)", "中華小廚師(愛藏版)", None, None, "unknown", None),
        ("凡爾賽玫瑰(完全版)", "凡爾賽玫瑰(完全版)", None, None, "unknown", None),
        ("城市獵人完全版", "城市獵人完全版", None, None, "unknown", None),
        ("CAT'SEYE貓之眼(完", "CAT'SEYE貓之眼", None, None, "finished", None),
        ("B棒球英豪【合集4部】", "B棒球英豪", None, None, "unknown", None),
        ("[海虎2][港漫]48集", "海虎2", None, None, "unknown", 48),
        ("[漢化][極真派空手道][東立]", "極真派空手道", None, "東立", "unknown", None),
        ("非常家庭珍藏版[AI全彩][2080×3000]JPG", "非常家庭珍藏版", None, None, "unknown", None),
    ],
)
def test_parse_series_name(name, title, author, publisher, status, total):
    info = parse_series_name(name)
    assert info.title == title
    assert info.author == author
    assert info.publisher == publisher
    assert info.status == status
    assert info.total_volumes == total


@pytest.mark.parametrize(
    "file_name, label, number",
    [
        ("[Kmoe][BLUEGIANT]卷01.epub", "第 01 卷", 1),
        ("[Kox][霸刀]話011-020.kepub.epub", "第 11–20 話", 11),
        ("[Kmoe][尋秦記]卷006-010.epub", "第 06–10 卷", 6),
        ("[Kox][封神紀(第一部)]06-10.kepub.epub", "06–10", 6),
        ("江湖大家族_江湖大家族 02集.pdf", "第 02 集", 2),
        ("陰陽路_01.pdf", "01", 1),
        ("第501回.pdf", "第 501 回", 501),
        ("Nine_Vol.01-03.rar", "Vol.01–03", 1),
        ("三國英雄傳_第001-041話.part1.rar", "第 01–41 話", 1),
        ("[satanli僅分享於伊莉獨家][信长][池上遼一][玉皇朝][小良家族]Vol_02.zip", "Vol.02", 2),
        ("[Kmoe][龍神湖]全一冊.epub", "全一冊", 0),
        ("[Kmoe][子說國學漫畫]卷02莊子說-自然的簫聲2.epub", "第 02 卷", 2),
        ("[Kmoe][SpyvsSpy：The]Vol.01.epub", "Vol.01", 1),
        ("[Kmoe][rude39]話002-003.epub", "第 02–03 話", 2),
        ("雪山飛狐(序章上+下篇)中漫版.rar", "上+下", 1),
        ("下册.pdf", "下册", 3),
        ("[漫画下载][邱福龙][东方不败][港漫].zip", "邱福龙 东方不败", None),
    ],
)
def test_parse_volume(file_name, label, number):
    v = parse_volume(file_name)
    assert v.label == label
    assert v.number == number


def test_split_ext():
    assert split_ext("a.kepub.epub") == ("a", "epub", None)
    assert split_ext("x_第001-041話.part2.rar") == ("x_第001-041話", "rar", 2)
    assert split_ext("Book.PDF") == ("Book", "pdf", None)


def test_natural_key():
    names = ["卷10.epub", "卷2.epub", "卷1.epub"]
    assert sorted(names, key=natural_key) == ["卷1.epub", "卷2.epub", "卷10.epub"]


@pytest.mark.parametrize(
    "title, expected",
    [("Furinkazan_01-03", "Furinkazan"), ("脫北者_第001-003話", "脫北者"), ("Nine_Vol.01-03", "Nine"), ("2001", "2001")],
)
def test_strip_volume_suffix(title, expected):
    from backend.parser import strip_volume_suffix

    assert strip_volume_suffix(title) == expected


@pytest.mark.parametrize(
    "file_name, expected",
    [
        ("[Kox][霸刀]話001-010.kepub.epub", "霸刀"),
        ("Nine_Vol.01-03.rar", "Nine"),
        ("SLOW-STEP漫步青春路_Vol.01-07.rar", "SLOW-STEP漫步青春路"),
        ("[satanli僅分享於伊莉獨家][信长][池上遼一][玉皇朝][小良家族]Vol_01.zip", "信长"),
        ("三國英雄傳_第001-041話.part1.rar", "三國英雄傳"),
        ("[Kmoe][子說國學漫畫]卷01莊子說-自然的簫聲.epub", "子說國學漫畫"),
    ],
)
def test_loose_title(file_name, expected):
    from backend.parser import loose_title

    assert loose_title(file_name) == expected


@pytest.mark.parametrize("name, generic", [("ePub", True), ("PDF格式", True), ("MOBI格式", True), ("PDF版", True),
                                           ("大然版本", True), ("Source", True), ("H2", False), ("MIX", False), ("Touch大学篇", False)])
def test_generic_dir(name, generic):
    from backend.scanner import is_generic_dir

    assert is_generic_dir(name) is generic
