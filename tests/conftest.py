import io
import zipfile
from pathlib import Path

import fiona
import pytest
from fastapi.testclient import TestClient
from fiona.crs import CRS

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path: Path):
    app = create_app(Settings(database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}"))
    with TestClient(app) as test_client:
        yield test_client


def kml(*placemarks: str) -> bytes:
    body = "".join(placemarks)
    return f'<kml xmlns="http://www.opengis.net/kml/2.2"><Document>{body}</Document></kml>'.encode()


POINT = (
    '<Placemark id="point-1"><name>Site</name><ExtendedData><Data name="code">'
    "<value>A1</value></Data></ExtendedData><Point><coordinates>77,12</coordinates>"
    "</Point></Placemark>"
)
LINE = (
    '<Placemark id="line-1"><LineString><coordinates>77,12 77.01,12</coordinates>'
    "</LineString></Placemark>"
)
POLYGON = (
    '<Placemark id="poly-1"><Polygon><outerBoundaryIs><LinearRing><coordinates>'
    "77,12 77.01,12 77.01,12.01 77,12.01 77,12</coordinates>"
    "</LinearRing></outerBoundaryIs></Polygon></Placemark>"
)
BAD = (
    '<Placemark id="bad"><Polygon><outerBoundaryIs><LinearRing><coordinates>'
    "77,12 77.01,12.01 77,12.01 77.01,12 77,12</coordinates>"
    "</LinearRing></outerBoundaryIs></Polygon></Placemark>"
)
UNSUPPORTED = (
    '<Placemark id="multi"><MultiGeometry><Point><coordinates>77,12</coordinates>'
    "</Point></MultiGeometry></Placemark>"
)


def shapefile_zip(
    tmp_path: Path,
    *,
    crs: bool = True,
    path_traversal: bool = False,
    geometry: dict | None = None,
) -> bytes:
    stem = tmp_path / "sample"
    geometry = geometry or {"type": "Point", "coordinates": (77, 12)}
    schema = {"geometry": geometry["type"], "properties": {"name": "str:40"}}
    with fiona.open(
        stem.with_suffix(".shp"),
        "w",
        driver="ESRI Shapefile",
        schema=schema,
        crs=CRS.from_epsg(4326) if crs else None,
    ) as dataset:
        dataset.write(
            {
                "geometry": geometry,
                "properties": {"name": "Bengaluru"},
            }
        )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for source in tmp_path.glob("sample.*"):
            archive.write(source, source.name)
        if path_traversal:
            archive.writestr("../escape.txt", "danger")
    return buffer.getvalue()
