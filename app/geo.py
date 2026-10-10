"""Safe dataset readers and per-feature projected measurements."""

import json
import math
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from typing import Any
from xml.etree.ElementTree import Element, ParseError

import fiona
import geopandas as gpd
import shapely
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from pyproj import CRS, Geod, Transformer
from pyproj.exceptions import CRSError, GeodError, ProjError
from shapely.geometry import (
    LinearRing,
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
    mapping,
    shape,
)
from shapely.geometry.base import BaseGeometry


class DatasetError(ValueError):
    """A dataset cannot be processed safely or meaningfully."""


MAX_FEATURES = 10_000
MAX_MEASUREMENT_VERTICES = 20_000
GEODESIC_SEGMENT_METRES = 25_000
MAX_RELATIVE_DISTORTION = 0.005


@dataclass
class ParsedFeature:
    index: int
    feature_id: str
    geometry: BaseGeometry | None
    geometry_type: str
    properties: dict[str, Any]
    error: str | None = None


@dataclass
class ParsedDataset:
    source_crs: str | None
    features: list[ParsedFeature]


def _local_name(element: Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def _children(element: Element, name: str) -> list[Element]:
    return [child for child in element if _local_name(child) == name]


def _descendants(element: Element, name: str) -> list[Element]:
    return [child for child in element.iter() if _local_name(child) == name]


def _coordinates(element: Element) -> list[tuple[float, float]]:
    nodes = _descendants(element, "coordinates")
    if len(nodes) != 1 or not nodes[0].text:
        raise ValueError("Geometry coordinates are missing")
    result = []
    for token in nodes[0].text.split():
        parts = token.split(",")
        if len(parts) < 2:
            raise ValueError("Invalid coordinate tuple")
        x, y = float(parts[0]), float(parts[1])
        if not (math.isfinite(x) and math.isfinite(y)):
            raise ValueError("Non-finite coordinates")
        result.append((x, y))
    return result


def _kml_geometry(node: Element) -> BaseGeometry:
    kind = _local_name(node)
    if kind == "Point":
        coords = _coordinates(node)
        if len(coords) != 1:
            raise ValueError("Point needs one coordinate")
        return Point(coords[0])
    if kind == "LineString":
        return LineString(_coordinates(node))
    if kind == "Polygon":
        outer = _children(node, "outerBoundaryIs")
        if len(outer) != 1:
            raise ValueError("Polygon needs one outer ring")
        shell = _coordinates(outer[0])
        holes = [_coordinates(inner) for inner in _children(node, "innerBoundaryIs")]
        return Polygon(shell, holes)
    raise ValueError(f"Unsupported KML geometry: {kind}")


def read_kml(path: Path) -> ParsedDataset:
    try:
        root = ElementTree.parse(path).getroot()
    except (ParseError, ValueError, DefusedXmlException) as exc:
        raise DatasetError("Malformed KML document") from exc
    if _local_name(root) != "kml":
        raise DatasetError("Document is not KML")
    features = []
    for index, placemark in enumerate(_descendants(root, "Placemark")):
        if index >= MAX_FEATURES:
            raise DatasetError("Dataset exceeds the 10,000 feature limit")
        props: dict[str, Any] = {}
        for name in ("name", "description"):
            nodes = _children(placemark, name)
            if nodes and nodes[0].text:
                props[name] = nodes[0].text
        for data in _descendants(placemark, "Data"):
            name = data.get("name")
            values = _children(data, "value")
            if name and values:
                props[name] = values[0].text
        for data in _descendants(placemark, "SimpleData"):
            if data.get("name"):
                props[data.attrib["name"]] = data.text
        nodes = [
            node
            for node in placemark
            if _local_name(node) in {"Point", "LineString", "Polygon", "MultiGeometry"}
        ]
        feature_id = placemark.get("id") or str(index)
        if len(nodes) != 1:
            features.append(
                ParsedFeature(
                    index,
                    feature_id,
                    None,
                    "Unknown",
                    props,
                    "Placemark needs one supported geometry",
                )
            )
            continue
        kind = _local_name(nodes[0])
        try:
            geometry = _kml_geometry(nodes[0])
            features.append(ParsedFeature(index, feature_id, geometry, geometry.geom_type, props))
        except (ValueError, TypeError, shapely.errors.GEOSException) as exc:
            features.append(ParsedFeature(index, feature_id, None, kind, props, str(exc)))
    if not features:
        raise DatasetError("KML contains no Placemarks")
    # KML coordinate tuples are WGS84 longitude, latitude under the KML specification.
    return ParsedDataset("EPSG:4326", features)


def _safe_json(value: Any) -> Any:
    def clean(item: Any) -> Any:
        if isinstance(item, float) and not math.isfinite(item):
            return None
        if isinstance(item, dict):
            return {str(key): clean(child) for key, child in item.items()}
        if isinstance(item, (list, tuple)):
            return [clean(child) for child in item]
        return item

    return json.loads(json.dumps(clean(value), default=str, allow_nan=False))


def _read_shapefile(path: Path) -> ParsedDataset:
    try:
        with fiona.open(path) as source:
            crs = (
                CRS.from_user_input(source.crs_wkt or source.crs).to_string()
                if (source.crs_wkt or source.crs)
                else None
            )
            features = []
            for index, raw in enumerate(source):
                if index >= MAX_FEATURES:
                    raise DatasetError("Dataset exceeds the 10,000 feature limit")
                feature_id = str(raw.get("id") or index)
                properties = _safe_json(dict(raw["properties"]))
                geometry_data = raw.get("geometry")
                try:
                    geometry = shape(geometry_data) if geometry_data else None
                    kind = geometry.geom_type if geometry else "Unknown"
                    error = None if geometry else "Geometry is missing"
                except (ValueError, TypeError, shapely.errors.GEOSException) as exc:
                    geometry, kind, error = None, "Unknown", f"Invalid geometry: {exc}"
                features.append(ParsedFeature(index, feature_id, geometry, kind, properties, error))
    except DatasetError:
        raise
    except (fiona.errors.FionaError, OSError, ValueError) as exc:
        raise DatasetError("Shapefile could not be read") from exc
    if not features:
        raise DatasetError("Shapefile contains no features")
    return ParsedDataset(crs, features)


def read_zip(path: Path) -> ParsedDataset:
    try:
        archive = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise DatasetError("Invalid ZIP archive") from exc
    with archive, TemporaryDirectory(prefix="aereo-shp-") as directory:
        members = archive.infolist()
        if len(members) > 100:
            raise DatasetError("ZIP contains too many entries")
        selected: dict[str, zipfile.ZipInfo] = {}
        total_size = 0
        for member in members:
            name = member.filename.replace("\\", "/")
            parts = PurePosixPath(name).parts
            if (
                name.startswith("/")
                or ".." in parts
                or ":" in name
                or (member.external_attr >> 16) & 0o170000 == 0o120000
            ):
                raise DatasetError("ZIP contains an unsafe entry")
            if member.is_dir():
                continue
            total_size += member.file_size
            if total_size > 100 * 1024 * 1024:
                raise DatasetError("ZIP expands beyond the allowed size")
            extension = Path(name).suffix.lower()
            if extension in {".shp", ".shx", ".dbf", ".prj", ".cpg"}:
                key = name.lower()
                if key in selected:
                    raise DatasetError("ZIP contains duplicate Shapefile components")
                selected[key] = member
        shp = [key for key in selected if key.endswith(".shp")]
        if len(shp) != 1:
            raise DatasetError("ZIP must contain exactly one Shapefile")
        stem = shp[0][:-4]
        if not all(stem + ext in selected for ext in (".shx", ".dbf")):
            raise DatasetError("Shapefile requires matching .shp, .shx and .dbf files")
        destination = Path(directory)
        try:
            extracted_size = 0
            for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
                member = selected.get(stem + ext)
                if member:
                    with (
                        archive.open(member) as source,
                        (destination / ("dataset" + ext)).open("wb") as target,
                    ):
                        while chunk := source.read(1024 * 1024):
                            extracted_size += len(chunk)
                            if extracted_size > 100 * 1024 * 1024:
                                raise DatasetError("ZIP expands beyond the allowed size")
                            target.write(chunk)
            return _read_shapefile(destination / "dataset.shp")
        except (RuntimeError, zipfile.BadZipFile, EOFError, OSError) as exc:
            raise DatasetError("Corrupt Shapefile ZIP") from exc


def _densify_geodesic(geometry: BaseGeometry, geod: Geod) -> BaseGeometry:
    """Represent each input edge with short geodesic segments before projection."""
    vertices = [0]

    def coordinates(line: LineString | LinearRing) -> list[tuple[float, float]]:
        source = [(float(x), float(y)) for x, y, *_ in line.coords]
        output = [source[0]]
        for first, second in zip(source, source[1:], strict=False):
            distance = geod.inv(first[0], first[1], second[0], second[1])[2]
            inserts = max(0, math.ceil(distance / GEODESIC_SEGMENT_METRES) - 1)
            vertices[0] += inserts + 1
            if vertices[0] > MAX_MEASUREMENT_VERTICES:
                raise DatasetError("Geometry is too detailed for safe projected measurement")
            if inserts:
                output.extend(geod.npts(*first, *second, inserts))
            output.append(second)
        return output

    def densify(part: BaseGeometry) -> BaseGeometry:
        if isinstance(part, LineString):
            return LineString(coordinates(part))
        if isinstance(part, Polygon):
            return Polygon(
                coordinates(part.exterior),
                [coordinates(ring) for ring in part.interiors],
            )
        if isinstance(part, MultiLineString):
            return MultiLineString([densify(child) for child in part.geoms])
        if isinstance(part, MultiPolygon):
            return MultiPolygon([densify(child) for child in part.geoms])
        raise DatasetError("Unsupported geometry for projected measurement")

    return densify(geometry)


def _geodesic_reference(geometry: BaseGeometry, geod: Geod, kind: str) -> float:
    if kind in {"LineString", "MultiLineString"}:
        return geod.geometry_length(geometry)
    polygons = geometry.geoms if kind == "MultiPolygon" else [geometry]
    return sum(
        abs(geod.geometry_area_perimeter(shapely.orient_polygons(polygon))[0])
        for polygon in polygons
    )


def measure(
    geometry: BaseGeometry | None, source_crs: str | None
) -> tuple[str | None, float | None, str | None, str | None, str, str | None]:
    """Return type, value, unit, target CRS, status, and public diagnostic."""
    if geometry is None or geometry.is_empty:
        return None, None, None, None, "ERROR", "Geometry is missing or empty"
    kind = geometry.geom_type
    if kind in {"Polygon", "MultiPolygon"}:
        measurement_type, unit = "area", "m2"
    elif kind in {"LineString", "MultiLineString"}:
        measurement_type, unit = "length", "m"
    elif kind in {"Point", "MultiPoint"}:
        measurement_type = unit = None
    else:
        return None, None, None, None, "ERROR", f"Unsupported geometry type: {kind}"
    if not geometry.is_valid:
        return (
            measurement_type,
            None,
            unit,
            None,
            "ERROR",
            "Invalid geometry; no automatic repair was applied",
        )
    coords = shapely.get_coordinates(geometry)
    if any(not (math.isfinite(x) and math.isfinite(y)) for x, y in coords[:, :2]):
        return measurement_type, None, unit, None, "ERROR", "Non-finite coordinates"
    if not source_crs:
        if measurement_type is None:
            return None, None, None, None, "NOT_APPLICABLE", None
        return measurement_type, None, unit, None, "ERROR", "Source CRS is unknown"
    try:
        source = CRS.from_user_input(source_crs)
    except CRSError:
        return measurement_type, None, unit, None, "ERROR", "Invalid source CRS"
    try:
        geographic = shapely.transform(
            geometry,
            Transformer.from_crs(source, "EPSG:4326", always_xy=True).transform,
            interleaved=False,
        )
        coords = shapely.get_coordinates(geographic)
        lons, lats = coords[:, 0], coords[:, 1]
        if not all(math.isfinite(x) and -90 <= x <= 90 for x in lats) or not all(
            math.isfinite(x) and -180 <= x <= 180 for x in lons
        ):
            raise DatasetError("Coordinates cannot be transformed to valid latitude/longitude")
        if measurement_type is None:
            return None, None, None, None, "NOT_APPLICABLE", None
        # Circular mean keeps a dateline-spanning feature centered near +/-180.
        radians = [math.radians(float(x)) for x in lons]
        lon0 = math.degrees(
            math.atan2(sum(math.sin(x) for x in radians), sum(math.cos(x) for x in radians))
        )
        lat0 = float(sum(lats) / len(lats))
        unwrapped = [lon0 + ((float(x) - lon0 + 180) % 360 - 180) for x in lons]
        width = max(unwrapped) - min(unwrapped)
        height = float(max(lats) - min(lats))
        if width > 60 or height > 60:
            raise DatasetError(
                "Feature spans more than 60 degrees; one local projection is unsuitable"
            )
        zones = {int(((x + 180) % 360) // 6) + 1 for x in unwrapped}
        if len(zones) == 1 and width <= 5 and -80 <= min(lats) and max(lats) <= 84:
            target = gpd.GeoSeries([geographic], crs="EPSG:4326").estimate_utm_crs()
            if target is None:
                raise DatasetError("No suitable UTM zone found")
        else:
            name = "laea" if measurement_type == "area" else "aeqd"
            target = CRS.from_proj4(
                f"+proj={name} +lat_0={lat0} +lon_0={lon0} +datum=WGS84 +units=m +over +type=crs"
            )
        geod = Geod(ellps="WGS84")
        reference = _geodesic_reference(geographic, geod, kind)
        if not math.isfinite(reference) or reference <= 0:
            raise DatasetError("Geodesic reference is not positive and finite")
        densified = _densify_geodesic(geographic, geod)
        projected = shapely.transform(
            densified,
            Transformer.from_crs("EPSG:4326", target, always_xy=True, force_over=True).transform,
            interleaved=False,
        )
        if projected.is_empty or not projected.is_valid:
            raise DatasetError("Projected geometry is invalid")
        metres_per_unit = target.axis_info[0].unit_conversion_factor
        if not math.isfinite(metres_per_unit) or metres_per_unit <= 0:
            raise DatasetError("Projected CRS has no usable linear unit")
        value = (
            projected.area * metres_per_unit**2
            if measurement_type == "area"
            else projected.length * metres_per_unit
        )
        if not math.isfinite(value):
            raise DatasetError("Projection produced a non-finite measurement")
        if abs(value - reference) / reference > MAX_RELATIVE_DISTORTION:
            raise DatasetError("Projected measurement exceeds 0.5% distortion tolerance")
        return measurement_type, float(value), unit, target.to_string(), "MEASURED", None
    except DatasetError as exc:
        return (
            measurement_type,
            None,
            unit,
            None,
            "ERROR",
            str(exc),
        )
    except (
        ValueError,
        ProjError,
        GeodError,
        shapely.errors.GEOSException,
        OverflowError,
        RuntimeError,
    ):
        return measurement_type, None, unit, None, "ERROR", "Projection or measurement failed"


def geometry_json(geometry: BaseGeometry | None) -> dict[str, Any] | None:
    return _safe_json(mapping(geometry)) if geometry is not None else None
