"""Convert persisted source geometry to map-safe WGS84 GeoJSON."""

import math
from typing import Any

import shapely
from pyproj import CRS, Transformer
from pyproj.exceptions import CRSError, ProjError
from shapely.geometry import mapping, shape


def to_map_geometry(
    geometry: dict[str, Any] | None, source_crs: str | None
) -> tuple[dict[str, Any] | None, str | None]:
    if geometry is None:
        return None, "Geometry is unavailable"
    if not source_crs:
        return None, "Source CRS is unknown; geometry cannot be placed on the map"
    try:
        source = CRS.from_user_input(source_crs)
        original = shapely.force_2d(shape(geometry))
        if original.is_empty or not original.is_valid:
            return None, "Geometry is empty or invalid"
        if original.geom_type not in {
            "Point",
            "MultiPoint",
            "LineString",
            "MultiLineString",
            "Polygon",
            "MultiPolygon",
        }:
            return None, f"Unsupported map geometry: {original.geom_type}"
        transformed = shapely.transform(
            original,
            Transformer.from_crs(source, "EPSG:4326", always_xy=True).transform,
            interleaved=False,
        )
        coordinates = shapely.get_coordinates(transformed)
        if (
            transformed.is_empty
            or not transformed.is_valid
            or not all(
                math.isfinite(x) and -180 <= x <= 180 and math.isfinite(y) and -90 <= y <= 90
                for x, y in coordinates[:, :2]
            )
        ):
            return None, "Geometry cannot be transformed to valid longitude/latitude"
        return mapping(transformed), None
    except (CRSError, ProjError, ValueError, TypeError, shapely.errors.GEOSException):
        return None, "Geometry could not be transformed for the map"
