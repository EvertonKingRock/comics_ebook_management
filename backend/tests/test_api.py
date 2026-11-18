from unittest import mock


def _series(client, **params):
    return client.get("/api/series", params=params).json()


def test_scan_builds_library(client):
    cats = {c["folder_name"]: c for c in client.get("/api/categories").json()}
    assert cats["HK"]["display_name"] == "香港"
    assert cats["HK"]["series_count"] == 2 and cats["HK"]["volume_count"] == 5
    # 安達充 is an author folder → ROUGH, H2 and loose 'Nine' are separate series; loose file is its own series.
    assert cats["Japan"]["series_count"] == 4

    hk = {s["title"]: s for s in _series(client, category_id=cats["HK"]["id"])["items"]}
    h = hk["皇朝傳奇"]
    assert (h["author"], h["status"], h["total_volumes"]) == ("倫裕國", "finished", 22)
    assert hk["天煞狂刀"]["volume_count"] == 2 and hk["天煞狂刀"]["total_volumes"] == 48

    titles = {s["title"]: s for s in _series(client, category_id=cats["Japan"]["id"])["items"]}
    assert set(titles) == {"ROUGH", "H2", "Nine", "Furinkazan"}
    assert titles["ROUGH"]["author"] == "安達充" and titles["Nine"]["author"] == "安達充"


def test_volume_order_and_labels(client):
    sid = _series(client, q="皇朝")["items"][0]["id"]
    vols = client.get(f"/api/series/{sid}").json()["volumes"]
    assert [v["volume_no"] for v in vols] == [1, 2, 10]


def test_edit_survives_rescan(client):
    from backend import scanner

    sid = _series(client, q="H2")["items"][0]["id"]
    r = client.patch(f"/api/series/{sid}", json={"author": "安達充（手動）", "rating": 5, "is_favorite": True})
    assert r.status_code == 200
    scanner.run_scan("full")
    d = client.get(f"/api/series/{sid}").json()
    assert d["author"] == "安達充（手動）" and d["rating"] == 5 and d["is_favorite"] is True
    # null reverts to the auto-parsed value
    d = client.patch(f"/api/series/{sid}", json={"author": None}).json()
    assert d["author"] == "安達充"


def test_tags_and_filters(client):
    t = client.post("/api/tags", json={"name": "運動", "color": "emerald"}).json()
    sid = _series(client, q="ROUGH")["items"][0]["id"]
    client.patch(f"/api/series/{sid}", json={"tag_ids": [t["id"]]})
    assert [s["id"] for s in _series(client, tag_id=t["id"])["items"]] == [sid]
    assert _series(client, q="運動")["total"] == 1
    assert _series(client, format="zip")["items"][0]["title"] == "H2"


def test_read_status_and_open(client):
    sid = _series(client, q="ROUGH")["items"][0]["id"]
    with mock.patch("backend.launcher.subprocess.Popen") as popen, \
         mock.patch("backend.launcher.settings") as s:
        s.sumatra_path = mock.MagicMock()
        s.sumatra_path.__str__.return_value = "SumatraPDF.exe"
        with mock.patch("backend.launcher.Path.is_file", return_value=True):
            r = client.post(f"/api/series/{sid}/continue")
        assert r.status_code == 200, r.text
        assert popen.call_args[0][0][1].endswith("卷01.epub")
    d = client.get(f"/api/series/{sid}").json()
    assert d["volumes"][0]["read_status"] == "reading"
    client.post(f"/api/series/{sid}/read-status", json={"read_status": "read"})
    assert _series(client, read="read")["items"][0]["id"] == sid


def test_open_rejects_unknown_volume(client):
    assert client.post("/api/volumes/999999/open").status_code == 404


def test_covers(client):
    from backend.covers import ensure_cover

    for q in ("ROUGH", "H2", "皇朝"):
        s = _series(client, q=q)["items"][0]
        r = client.get(f"/api/covers/volume/{s['cover_volume_id']}")
        assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    broken = _series(client, q="Furinkazan")["items"][0]
    assert ensure_cover(broken["cover_volume_id"]) is None
    assert client.get(f"/api/covers/volume/{broken['cover_volume_id']}").status_code == 404
    # EPUB description was picked up as summary
    rough = client.get(f"/api/series/{_series(client, q='ROUGH')['items'][0]['id']}").json()
    assert rough["summary"] == "游泳青春故事"


def test_stats_settings_export(client):
    st = client.get("/api/stats").json()
    assert st["totals"]["volumes"] == 9
    assert {c["name"] for c in st["by_category"]} == {"香港", "日本", "台灣", "美國"}
    cfg = client.get("/api/settings").json()
    assert cfg["comics_root_ok"] is True
    csv = client.get("/api/export.csv")
    assert csv.status_code == 200 and "皇朝傳奇" in csv.content.decode("utf-8-sig")


def test_missing_files_flagged_not_deleted(client, comics_root):
    from backend import scanner

    f = comics_root / "Japan" / "安達充" / "H2" / "H2_Vol.01.zip"
    moved = f.with_suffix(".bak")
    f.rename(moved)
    try:
        scanner.run_scan("incremental")
        assert _series(client, q="H2")["total"] == 0
        assert client.get("/api/stats").json()["quality"]["missing_files"] == 1
    finally:
        moved.rename(f)
    scanner.run_scan("incremental")
    s = _series(client, q="H2")["items"][0]
    assert s["is_favorite"] is True  # user data kept across disappearance
