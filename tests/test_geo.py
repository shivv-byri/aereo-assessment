import io
import stat
import zipfile

import shapely
from pyproj import Geod, Transformer
from shapely.geometry import (
    GeometryCollection,
    LineString,
    MultiLineString,
    MultiPoint,
    MultiPolygon,
    Point,
    Polygon,
)

from app.geo import measure
from tests.conftest import POINT, kml, shapefile_zip


def test_missing_crs_measurable_feature(client, tmp_path):
    line = {"type": "LineString", "coordinates": [(77, 12), (77.01, 12)]}
    response = client.post(
        "/api/files/",
        files={"upload": ("line.zip", shapefile_zip(tmp_path, crs=False, geometry=line))},
    )
    assert response.status_code == 422
    file_id = response.json()["detail"]["file_id"]
    info = client.get(f"/api/files/{file_id}/").json()
    assert info["processing_status"] == "FAILED" and info["source_crs"] is None
    item = client.get(f"/api/files/{file_id}/measurements/").json()["items"][0]
    assert item["measurement_value"] is None and item["error"] == "Source CRS is unknown"


def test_projection_selection_and_geometry_types():
    line = LineString([(5.9, 12), (6.1, 12)])
    kind, value, unit, target, status, error = measure(line, "EPSG:4326")
    assert (kind, unit, status, error) == ("length", "m", "MEASURED", None)
    assert 20_000 < value < 25_000
    assert "+proj=aeqd" in target

    polygon = Polygon([(5.9, 12), (6.1, 12), (6.1, 12.1), (5.9, 12.1)])
    kind, value, unit, target, status, error = measure(polygon, "EPSG:4326")
    assert (kind, unit, status, error) == ("area", "m2", "MEASURED", None)
    assert value > 200_000_000 and "+proj=laea" in target

    assert measure(MultiLineString([line, line]), "EPSG:4326")[4] == "MEASURED"
    assert measure(MultiPolygon([polygon]), "EPSG:4326")[4] == "MEASURED"
    assert measure(Point(77, 12), "EPSG:4326")[4] == "NOT_APPLICABLE"
    assert measure(GeometryCollection([Point(77, 12)]), "EPSG:4326")[4] == "ERROR"


def test_dateline_and_large_feature():
    short_crossing = LineString([(179.9, 10), (-179.9, 10)])
    result = measure(short_crossing, "EPSG:4326")
    assert result[4] == "MEASURED" and 20_000 < result[1] < 25_000
    huge = LineString([(-80, 0), (80, 0)])
    assert measure(huge, "EPSG:4326")[4] == "ERROR"


def test_invalid_geometry_and_coordinates():
    bowtie = Polygon([(0, 0), (1, 1), (0, 1), (1, 0), (0, 0)])
    assert measure(bowtie, "EPSG:4326")[4] == "ERROR"
    assert measure(Point(77, 200), "EPSG:4326")[4] == "ERROR"
    projected = measure(LineString([(0, 0), (1000, 0)]), "EPSG:3857")
    assert projected[4] == "MEASURED" and 950 < projected[1] < 1050


def test_zip_missing_component_and_malformed_feature(client, tmp_path):
    data = shapefile_zip(tmp_path)
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as original, zipfile.ZipFile(buffer, "w") as reduced:
        for name in original.namelist():
            if not name.endswith(".shx"):
                reduced.writestr(name, original.read(name))
    response = client.post("/api/files/", files={"upload": ("missing.zip", buffer.getvalue())})
    assert response.status_code == 422
    assert ".shx" in response.json()["detail"]["message"]

    malformed = '<Placemark id="bad"><Point><coordinates>oops</coordinates></Point></Placemark>'
    response = client.post("/api/files/", files={"upload": ("mixed.kml", kml(POINT, malformed))})
    assert response.status_code == 201
    assert response.json()["processing_status"] == "PARTIAL_SUCCESS"
    assert (
        client.get(response.json()["measurements_url"]).json()["items"][1]["measurement_status"]
        == "ERROR"
    )


def test_xml_entity_is_rejected(client):
    data = (
        b'<!DOCTYPE kml [<!ENTITY x "unsafe">]><kml><Placemark><name>&x;</name></Placemark></kml>'
    )
    response = client.post("/api/files/", files={"upload": ("entity.kml", data)})
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == "Malformed KML document"


def test_regional_polygon_matches_geodesic_reference():
    polygon = Polygon([(-29, 0), (29, 0), (29, 20), (-29, 20)])
    result = measure(polygon, "EPSG:4326")
    reference = abs(Geod(ellps="WGS84").geometry_area_perimeter(polygon)[0])
    assert result[4] == "MEASURED"
    # 0.5% permits projected approximation while detecting sparse-edge distortion.
    assert abs(result[1] - reference) / reference < 0.005


def test_regional_line_with_excess_projection_distortion_is_rejected():
    line = LineString([(-29, 20), (-29, 40), (29, 40), (29, 20)])
    result = measure(line, "EPSG:4326")
    assert result[4] == "ERROR" and result[1] is None
    assert "distortion" in result[5].lower()


def test_nonfinite_point_and_invalid_crs_are_feature_errors():
    assert measure(Point(float("nan"), 1), None)[4] == "ERROR"
    result = measure(LineString([(0, 0), (1, 0)]), "NOT_A_CRS")
    assert result[4] == "ERROR" and result[1] is None


def test_dateline_polygon_and_hole_against_geodesic_reference():
    crossing = Polygon([(179.9, 10), (-179.9, 10), (-179.9, 10.1), (179.9, 10.1)])
    polygon_with_hole = Polygon(
        [(77, 12), (77.1, 12), (77.1, 12.1), (77, 12.1)],
        holes=[[(77.02, 12.02), (77.08, 12.02), (77.08, 12.08), (77.02, 12.08)]],
    )
    geod = Geod(ellps="WGS84")
    for polygon in (crossing, polygon_with_hole):
        result = measure(polygon, "EPSG:4326")
        reference = abs(geod.geometry_area_perimeter(shapely.orient_polygons(polygon))[0])
        assert result[4] == "MEASURED"
        assert abs(result[1] - reference) / reference < 0.005


def test_corrupt_member_and_symlink_are_rejected(client, tmp_path):
    original = shapefile_zip(tmp_path)
    corrupted = bytearray(original)
    with zipfile.ZipFile(io.BytesIO(original)) as archive:
        member = archive.getinfo("sample.dbf")
        data_start = member.header_offset + 30 + len(member.filename) + len(member.extra)
    corrupted[data_start + 10] ^= 0x01
    response = client.post("/api/files/", files={"upload": ("crc.zip", bytes(corrupted))})
    assert response.status_code == 422
    assert "Corrupt" in response.json()["detail"]["message"]

    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(buffer, "w") as target:
        for name in source.namelist():
            target.writestr(name, source.read(name))
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        target.writestr(link, "../outside")
    response = client.post("/api/files/", files={"upload": ("link.zip", buffer.getvalue())})
    assert response.status_code == 422
    assert "unsafe" in response.json()["detail"]["message"]


def test_utm_hemispheres_zone_boundary_and_multipoint():
    geod = Geod(ellps="WGS84")
    for latitude, expected_crs in ((12, "EPSG:32643"), (-12, "EPSG:32743")):
        line = LineString([(77, latitude), (77.01, latitude)])
        result = measure(line, "EPSG:4326")
        reference = geod.geometry_length(line)
        assert result[4] == "MEASURED" and result[3] == expected_crs
        assert abs(result[1] - reference) / reference < 0.005

    boundary = LineString([(5.99, 12), (6.01, 12)])
    result = measure(boundary, "EPSG:4326")
    assert result[4] == "MEASURED" and "+proj=aeqd" in result[3]
    assert abs(result[1] - geod.geometry_length(boundary)) / geod.geometry_length(boundary) < 0.005
    assert measure(MultiPoint([(77, 12), (77.01, 12)]), "EPSG:4326")[4] == "NOT_APPLICABLE"
    assert measure(Polygon(), "EPSG:4326")[4] == "ERROR"


def test_projected_source_in_feet_returns_metres():
    x, y = Transformer.from_crs("EPSG:4326", "EPSG:2277", always_xy=True).transform(-97, 31)
    result = measure(LineString([(x, y), (x + 1000, y)]), "EPSG:2277")
    assert result[4] == "MEASURED" and result[2] == "m"
    # 1,000 US survey feet are about 304.8 m; 1% covers local projection scale.
    assert 301.8 < result[1] < 307.8
