"""Create a small zipped Shapefile for manual API testing."""

import tempfile
import zipfile
from pathlib import Path

import fiona
from fiona.crs import CRS


def main() -> None:
    output = Path(__file__).resolve().parent.parent / "samples" / "sample-points.zip"
    with tempfile.TemporaryDirectory(prefix="aereo-example-") as directory:
        stem = Path(directory) / "points"
        schema = {"geometry": "Point", "properties": {"name": "str:40"}}
        with fiona.open(
            stem.with_suffix(".shp"),
            "w",
            driver="ESRI Shapefile",
            schema=schema,
            crs=CRS.from_epsg(4326),
        ) as dataset:
            dataset.write(
                {
                    "geometry": {"type": "Point", "coordinates": (77, 12)},
                    "properties": {"name": "Survey site"},
                }
            )
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for component in stem.parent.glob("points.*"):
                archive.write(component, component.name)
    print(output)


if __name__ == "__main__":
    main()
