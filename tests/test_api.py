import asyncio
import io
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings
from app.main import create_app
from app.models import FileRecord
from app.upload_limit import UploadBodyLimit
from tests.conftest import BAD, LINE, POINT, POLYGON, UNSUPPORTED, kml, shapefile_zip


def upload(client: TestClient, data: bytes, name: str = "sample.kml"):
    return client.post("/api/files/", files={"upload": (name, data, "application/octet-stream")})


def test_kml_measurements_properties_pagination_and_persistence(client):
    response = upload(client, kml(POINT, LINE, POLYGON))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["processing_status"] == "COMPLETED"
    assert body["source_crs"] == "EPSG:4326"
    assert body["feature_count"] == 3
    assert client.get(body["file_url"]).json()["feature_count"] == 3
    page = client.get(body["measurements_url"], params={"limit": 2}).json()
    assert page["total"] == 3 and len(page["items"]) == 2
    assert page["items"][0]["feature_id"] == "point-1"
    assert page["items"][0]["properties"] == {"name": "Site", "code": "A1"}
    assert page["items"][0]["measurement_status"] == "NOT_APPLICABLE"
    assert page["items"][0]["geometry"]["type"] == "Point"
    line = page["items"][1]
    assert line["geometry_type"] == "LineString" and line["measurement_unit"] == "m"
    assert 1000 < line["measurement_value"] < 1200  # 0.01 longitude degree near 12 N
    assert line["projected_crs"].startswith("EPSG:326")
    polygon = client.get(body["measurements_url"], params={"offset": 2}).json()["items"][0]
    assert polygon["measurement_unit"] == "m2"
    assert 1_000_000 < polygon["measurement_value"] < 1_300_000


def test_shapefile_zip_and_missing_crs(client, tmp_path):
    response = upload(client, shapefile_zip(tmp_path), "points.zip")
    assert response.status_code == 201, response.text
    assert response.json()["file_format"] == "shapefile_zip"
    assert response.json()["source_crs"] == "EPSG:4326"
    item = client.get(response.json()["measurements_url"]).json()["items"][0]
    assert item["properties"]["name"] == "Bengaluru"
    assert item["geometry_type"] == "Point"

    other = tmp_path / "other"
    other.mkdir()
    response = upload(client, shapefile_zip(other, crs=False), "unknown.zip")
    assert response.status_code == 201
    assert response.json()["source_crs"] is None
    assert (
        client.get(response.json()["measurements_url"]).json()["items"][0]["projected_crs"] is None
    )


def test_mixed_feature_failure(client):
    response = upload(client, kml(POINT, BAD, UNSUPPORTED, LINE))
    assert response.status_code == 201
    assert response.json()["processing_status"] == "PARTIAL_SUCCESS"
    items = client.get(response.json()["measurements_url"]).json()["items"]
    assert [item["measurement_status"] for item in items] == [
        "NOT_APPLICABLE",
        "ERROR",
        "ERROR",
        "MEASURED",
    ]
    assert items[1]["measurement_value"] is None
    assert items[2]["error"]


def test_invalid_uploads_and_failed_record(client):
    assert upload(client, b"hello", "bad.txt").status_code == 415
    assert upload(client, b"broken", "bad.zip").status_code == 400
    assert upload(client, b"", "empty.kml").status_code == 400
    malformed = upload(client, b"<kml><Placemark>", "bad.kml")
    assert malformed.status_code == 422
    file_id = malformed.json()["detail"]["file_id"]
    assert client.get(f"/api/files/{file_id}/").json()["processing_status"] == "FAILED"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("readme.txt", "none")
    response = upload(client, buffer.getvalue(), "missing.zip")
    assert response.status_code == 422
    assert "Shapefile" in response.json()["detail"]["message"]


def test_zip_traversal_and_size_limit(client, tmp_path):
    response = upload(client, shapefile_zip(tmp_path, path_traversal=True), "bad.zip")
    assert response.status_code == 422
    assert "unsafe" in response.json()["detail"]["message"]
    tiny = TestClient(
        create_app(
            Settings(
                database_url=f"sqlite:///{(tmp_path / 'tiny.db').as_posix()}", max_upload_bytes=10
            )
        )
    )
    with tiny:
        assert upload(tiny, kml(POINT)).status_code == 413


def test_unknown_id_and_health(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/files/does-not-exist/").status_code == 404
    assert client.get("/api/files/does-not-exist/measurements/").status_code == 404


def test_records_survive_app_restart(tmp_path):
    settings = Settings(database_url=f"sqlite:///{(tmp_path / 'persist.db').as_posix()}")
    with TestClient(create_app(settings)) as first:
        result = upload(first, kml(POINT, LINE))
        assert result.status_code == 201
        file_id = result.json()["id"]
    with TestClient(create_app(settings)) as second:
        info = second.get(f"/api/files/{file_id}/").json()
        assert info["processing_status"] == "COMPLETED"
        assert info["created_at"].endswith("Z")
        assert second.get(f"/api/files/{file_id}/measurements/").json()["total"] == 2


def test_processing_exception_does_not_leave_processing_record(tmp_path, monkeypatch):
    import app.service as service

    database_url = f"sqlite:///{(tmp_path / 'failed.db').as_posix()}"
    original = service.measure
    calls = 0

    def failing_measure(geometry, crs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("internal test failure with hidden details")
        return original(geometry, crs)

    monkeypatch.setattr(service, "measure", failing_measure)
    with TestClient(
        create_app(Settings(database_url=database_url)), raise_server_exceptions=False
    ) as client:
        response = upload(client, kml(POINT, LINE))
        assert response.status_code == 500
        assert "hidden details" not in response.text
        file_id = response.json()["detail"]["file_id"]
        assert client.get(f"/api/files/{file_id}/measurements/").json()["total"] == 0
        with Session(create_engine(database_url)) as session:
            record = session.scalar(select(FileRecord))
            assert record.id == file_id
            assert record.processing_status == "FAILED"
            assert "hidden details" not in (record.error_summary or "")


def test_request_body_limit_precedes_multipart_parsing(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'body-limit.db').as_posix()}",
        max_upload_bytes=10,
    )
    with TestClient(create_app(settings)) as client:
        response = upload(client, b"a" * 70_000, "unsupported.txt")
    assert response.status_code == 413
    assert response.json() == {"detail": "Upload exceeds configured size limit"}


def test_streamed_body_limit_without_content_length():
    sent = []

    async def app(_scope, receive, _send):
        await receive()

    async def receive():
        return {"type": "http.request", "body": b"x" * 70_000, "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/api/files/", "headers": []}
    asyncio.run(UploadBodyLimit(app, max_upload_bytes=10)(scope, receive, send))
    assert sent[0]["type"] == "http.response.start"
    assert sent[0]["status"] == 413


def test_recoverable_database_error_marks_file_failed(tmp_path, monkeypatch):
    import app.service as service

    database_url = f"sqlite:///{(tmp_path / 'write-error.db').as_posix()}"

    def fail_store(_session, _record, _dataset):
        raise SQLAlchemyError("private database details")

    monkeypatch.setattr(service, "_store_dataset", fail_store)
    with TestClient(create_app(Settings(database_url=database_url))) as client:
        response = upload(client, kml(POINT))
    assert response.status_code == 503
    assert response.json() == {"detail": "Database operation failed"}
    with Session(create_engine(database_url)) as session:
        record = session.scalar(select(FileRecord))
        assert record.processing_status == "FAILED"


def test_file_listing_filters_and_persists(tmp_path):
    settings = Settings(database_url=f"sqlite:///{(tmp_path / 'list.db').as_posix()}")
    with TestClient(create_app(settings)) as client:
        first = upload(client, kml(POINT), "first.kml").json()["id"]
        second = upload(client, kml(BAD, LINE), "second.kml").json()["id"]
        assert client.get("/api/files/", params={"limit": 1}).json()["total"] == 2
        page = client.get(
            "/api/files/", params={"search": "second", "status": "PARTIAL_SUCCESS"}
        ).json()
        assert page["total"] == 1 and page["items"][0]["id"] == second
        assert client.get("/api/files/", params={"status": "BOGUS"}).status_code == 422
    with TestClient(create_app(settings)) as client:
        assert {item["id"] for item in client.get("/api/files/").json()["items"]} == {first, second}


def test_map_geojson_transforms_projected_coordinates_and_withholds_unknown_crs(client, tmp_path):
    from pyproj import Transformer

    east, north = Transformer.from_crs(4326, 32643, always_xy=True).transform(77, 12)
    projected = tmp_path / "projected"
    projected.mkdir()
    import fiona
    from fiona.crs import CRS

    stem = projected / "sample"
    with fiona.open(
        stem.with_suffix(".shp"),
        "w",
        driver="ESRI Shapefile",
        schema={"geometry": "Point", "properties": {"name": "str:40"}},
        crs=CRS.from_epsg(32643),
    ) as dataset:
        dataset.write(
            {
                "geometry": {"type": "Point", "coordinates": (east, north)},
                "properties": {"name": "Projected"},
            }
        )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for path in projected.glob("sample.*"):
            archive.write(path, path.name)
    result = upload(client, buffer.getvalue(), "projected.zip")
    assert result.status_code == 201
    file_id = result.json()["id"]
    page = client.get(f"/api/files/{file_id}/features/geojson/").json()
    assert page["crs"] == "EPSG:4326" and page["total"] == 1
    lon, lat = page["items"][0]["geometry"]["coordinates"]
    assert abs(lon - 77) < 0.0001 and abs(lat - 12) < 0.0001
    assert (
        client.get(f"/api/files/{file_id}/features/geojson/", params={"limit": 0}).status_code
        == 422
    )
    assert client.get("/api/files/missing/features/geojson/").status_code == 404

    missing = tmp_path / "unknown-map"
    missing.mkdir()
    unknown_id = upload(client, shapefile_zip(missing, crs=False), "unknown.zip").json()["id"]
    feature = client.get(f"/api/files/{unknown_id}/features/geojson/").json()["items"][0]
    assert feature["geometry"] is None and "CRS" in feature["error"]


def test_measurement_server_filters_sort_and_pagination(client):
    file_id = upload(client, kml(POINT, LINE, POLYGON), "measure.kml").json()["id"]
    url = f"/api/files/{file_id}/measurements/"
    assert client.get(url, params={"search": "Site"}).json()["total"] == 1
    assert (
        client.get(url, params={"geometry_type": "Polygon"}).json()["items"][0]["feature_id"]
        == "poly-1"
    )
    page = client.get(url, params={"sort": "feature_index", "direction": "desc", "limit": 1}).json()
    assert page["total"] == 3 and page["items"][0]["feature_id"] == "poly-1"
    assert client.get(url, params={"measurement_status": "MEASURED"}).json()["total"] == 2


def test_map_withholds_invalid_feature_without_losing_valid_feature(client):
    file_id = upload(client, kml(BAD, LINE)).json()["id"]
    items = client.get(f"/api/files/{file_id}/features/geojson/").json()["items"]
    assert items[0]["geometry"] is None
    assert "invalid" in items[0]["error"].lower()
    assert items[1]["geometry"]["type"] == "LineString"


def test_cors_is_limited_to_configured_local_origin(client):
    headers = {"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST"}
    accepted = client.options("/api/files/", headers=headers)
    assert accepted.headers["access-control-allow-origin"] == headers["Origin"]
    rejected = client.options(
        "/api/files/",
        headers={**headers, "Origin": "https://untrusted.example"},
    )
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers
