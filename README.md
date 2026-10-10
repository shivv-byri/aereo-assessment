# AEREO Geospatial Workspace

A React geospatial workspace and FastAPI measurement service for uploading KML or zipped Shapefiles, inspecting persisted geometry, and exploring CRS-aware area or length measurements. Results remain available in SQLite after the upload response. A PostgreSQL SQLAlchemy URL is configurable with a compatible driver, but PostgreSQL has not been tested here.

The problem this solves is turning source geometries and attributes into retrievable physical measurements without treating longitude and latitude degrees as metres. The API records source CRS and per-feature outcomes so users can distinguish a valid result from an unavailable one.

## Run the full application

Prerequisites: Python 3.11 or 3.12 with compatible geospatial wheels, Node.js 20.19+ or 22.12+, and npm. This checkout was verified with Python 3.11 and Node 24. Run backend and frontend in separate terminals:

```powershell
# Terminal 1, from the repository root
py -3.11 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2, from the repository root
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The API is at `http://127.0.0.1:8000`, with OpenAPI documentation at `/docs`. Tables are created when the API starts. `frontend/.env.example` documents optional `VITE_API_BASE_URL` and `VITE_TILE_URL` overrides; copy it to `frontend/.env.local` only when needed. Vite variables are public browser configuration, not a place for secrets. The backend accepts `CORS_ORIGINS` as a comma-separated list; its default permits only the two local Vite origins.

The web app provides Overview, Upload Files, Map Workspace, Measurements, File History, and API Status. Overview counts and history come from persisted API records. The map requests WGS84 geometry from the API and loads 500 features at a time, up to 2,000 loaded features per view. The OpenStreetMap basemap is attributed; if tiles fail, geometry remains interactive on a plain background. A public deployment should choose a tile provider and usage plan appropriate to its traffic.

Uploads are synchronous. The browser shows an indeterminate processing state, then uses the returned file ID. It does not invent percentage progress or a background job. The frontend warns early above the backend's default 20 MiB limit; backend validation remains authoritative and its limit may be configured differently.

## Assignment coverage

- Accepts `.kml` and `.zip` Shapefile uploads, validates contents, and limits upload size.
- Stores file metadata and each feature's ID, index, geometry, type, properties, source CRS, measurement, target CRS, status, and diagnostic.
- Measures Polygon and MultiPolygon area in **square metres (`m2`)** and LineString and MultiLineString length in **metres (`m`)**. Point and MultiPoint return `NOT_APPLICABLE`.
- Uses projected coordinates selected for each feature; errors are explicit when CRS, geometry, or projection prevents a measurement.
- Provides upload, persisted file listing, file metadata, paginated measurements, map-safe GeoJSON, and health endpoints.

No separate assignment document was present in the workspace. This implementation follows the requirements in the supplied task description.

## Stack and prerequisites

Python 3.11 or 3.12, FastAPI, Uvicorn, SQLAlchemy 2, SQLite, Fiona, GeoPandas, Shapely, PyProj, Pydantic, and defusedxml. Development tools are pytest, FastAPI TestClient, httpx, and Ruff. This project was developed and tested with Python 3.11 on Windows; Python 3.12 has not been exercised here. Native geospatial wheels must be available for the selected Python and platform.

### Setup on Windows PowerShell

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
$env:DATABASE_URL = "sqlite:///./aereo.db"
$env:MAX_UPLOAD_BYTES = "20971520"
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

On Unix, use `python3.11 -m venv .venv`, `.venv/bin/python`, and `export` for environment variables. The defaults in `.env.example` are used when variables are unset. `.env` is an example reference only: environment variables are read directly, without automatic dotenv loading. Tables are created at application startup. For PostgreSQL, install a compatible driver such as `psycopg` separately and set a SQLAlchemy PostgreSQL URL; schema migrations are not included.

Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/files/` | Multipart upload; field name `upload` |
| `GET` | `/api/files/?limit=20&offset=0&search=&status=` | Persisted file history, newest first; limit 1–100 |
| `GET` | `/api/files/{id}/` | Persisted file metadata and status |
| `GET` | `/api/files/{id}/measurements/?limit=100&offset=0` | Feature details and measurements; limit 1–500; optional `search`, `geometry_type`, `measurement_status`, `sort`, `direction` |
| `GET` | `/api/files/{id}/features/geojson/?limit=500&offset=0` | Paginated map geometry transformed to WGS84; limit 1–500 |
| `GET` | `/health` | Basic process health |

Create a sample zipped Shapefile, then upload either sample:

```powershell
.\.venv\Scripts\python scripts\make_sample_shapefile.py
curl.exe -F "upload=@samples/example.kml" http://127.0.0.1:8000/api/files/
curl.exe -F "upload=@samples/sample-points.zip" http://127.0.0.1:8000/api/files/
curl.exe http://127.0.0.1:8000/api/files/REPLACE_WITH_ID/
curl.exe "http://127.0.0.1:8000/api/files/REPLACE_WITH_ID/measurements/?limit=100&offset=0"
curl.exe "http://127.0.0.1:8000/api/files/?limit=20&offset=0"
curl.exe "http://127.0.0.1:8000/api/files/REPLACE_WITH_ID/features/geojson/?limit=500&offset=0"
```

`samples/sample-points.zip` contains one **Point** in EPSG:4326, so its measurement is `NOT_APPLICABLE`. `samples/example.kml` contains a point, line, and polygon near 77°E, 12°N. These checked-in samples are different from a separately uploaded polygon near 78.47°E, 17.44°N that may appear in a local workspace as approximately 235,376 m². The original uploaded ZIP is not retained by this application; its extracted geometry and measurement are persisted.

A successful KML upload returns HTTP 201 with this shape (UUID and timestamp vary):

```json
{
  "id": "f5039bb7-c932-4eeb-8bc1-51afe1c300a0",
  "original_filename": "example.kml",
  "file_format": "kml",
  "source_crs": "EPSG:4326",
  "feature_count": 3,
  "processing_status": "COMPLETED",
  "created_at": "2026-10-09T12:00:00Z",
  "error_summary": null,
  "file_url": "/api/files/f5039bb7-c932-4eeb-8bc1-51afe1c300a0/",
  "measurements_url": "/api/files/f5039bb7-c932-4eeb-8bc1-51afe1c300a0/measurements/"
}
```

The measurement endpoint returns `file_id`, `total`, `limit`, `offset`, and `items`. A representative item is:

```json
{
  "feature_index": 1,
  "feature_id": "route-1",
  "geometry_type": "LineString",
  "geometry": {"type": "LineString", "coordinates": [[77.0, 12.0], [77.01, 12.0]]},
  "properties": {"name": "Short route"},
  "source_crs": "EPSG:4326",
  "projected_crs": "EPSG:32643",
  "measurement_type": "length",
  "measurement_value": 1089.0,
  "measurement_unit": "m",
  "measurement_status": "MEASURED",
  "error": null
}
```

The value above is illustrative; it varies slightly by geometry and projection. Point records contain null measurement fields and `NOT_APPLICABLE`.

The map endpoint returns `{file_id, crs: "EPSG:4326", total, limit, offset, items}`. Each item has `feature_index`, `feature_id`, `geometry_type`, `geometry`, `properties`, and `error`. Its geometry is WGS84 GeoJSON in **longitude, latitude** order. For backward compatibility, the measurement endpoint's `geometry` remains in the **source CRS**; projected source coordinates must not be passed directly to Leaflet. Unknown CRS, invalid, empty, and unsupported map geometries return `geometry: null` with an explanation. Map availability is distinct from whether a physical measurement succeeded.

## CRS and measurement policy

Longitude and latitude are angles in degrees. Computing planar area or length on those values yields square degrees or degrees, not physical square metres or metres, and the physical size of a degree varies by latitude.

KML coordinates are interpreted as WGS84 longitude and latitude (`EPSG:4326`) under the KML convention. Fiona reads the Shapefile CRS from its `.prj` when available. Without CRS metadata, `source_crs` stays null; measurable features have null values and an explicit `Source CRS is unknown` error. No CRS is inferred from coordinate appearance.

For each valid measurable feature, the service transforms its source CRS to WGS84 for region inspection, then:

1. Uses a GeoPandas estimated UTM CRS when all vertices are within one UTM zone, the longitude span is at most 5 degrees, and the feature lies in UTM latitude range (80°S to 84°N).
2. Otherwise uses a local Lambert azimuthal equal area projection for polygons, or a local azimuthal equidistant projection for lines, centered on the feature. A circular longitude mean handles compact antimeridian crossings.
3. Rejects a feature spanning more than 60 degrees in longitude or latitude, since one local projection is unsuitable. Projection failures also yield a null result and an error.

`projected_crs` records the selected EPSG code or PROJ definition. Source edges are treated as geodesic segments, sampled at intervals of at most 25 km before projection; area and length then come from projected Shapely geometry. The target CRS linear unit is explicitly converted to metres (and squared for area). A WGS84 geodesic calculation checks the result; if projected and geodesic values differ by more than 0.5%, the feature returns an error and a null measurement. This check bounds one source of projection distortion under the geodesic-edge assumption. It is not a survey accuracy guarantee, especially when source edges have a different intended interpretation or the source datum transformation has limited accuracy. A local azimuthal equidistant projection preserves distances from its centre, not every segment throughout a broad feature. Invalid geometries are rejected without automatic repair: repair could change their shape and measured value. KML altitude is ignored, so lengths and areas are 2D ground projections, not 3D terrain measurements.

## Validation, errors, and status

Uploads are copied in chunks into an isolated temporary directory and deleted after processing. The route enforces a 20 MiB default **file** limit (`MAX_UPLOAD_BYTES`); ASGI middleware bounds the entire multipart body at that limit plus 64 KiB of framing allowance before multipart parsing. ZIP entries are checked for traversal, symlinks, duplicates, excessive count, and more than 100 MiB of expanded content. Only one matching `.shp`, `.shx`, `.dbf` group (plus optional `.prj` and `.cpg`) is extracted under generated internal names. XML entity declarations are rejected by defusedxml. A 10,000 feature limit bounds stored results; geodesic densification permits at most 20,000 vertices per measurable feature. For internet-facing deployment, also enforce request body limits at the reverse proxy.

`PROCESSING` is committed at acceptance. `COMPLETED` means every feature was measured or needed no measurement. `PARTIAL_SUCCESS` means at least one feature failed and at least one succeeded or needed no measurement. `FAILED` means file parsing failed, every feature failed, or processing stopped unexpectedly. A recoverable database write error also marks the file `FAILED`; a sustained outage may prevent that update. Failed files remain queryable when the database is available. Dataset failures return HTTP 422 with `detail.message` and `detail.file_id`; individual feature diagnostics can still be retrieved when parsing succeeded.

Other responses: 400 for empty upload or non-ZIP content, 413 for size limit, 415 for unsupported extension, 404 for unknown ID, 422 for invalid dataset or request parameters, 503 for a database error, and 500 for an unexpected processing failure. The 500 response includes a `file_id`; the accepted file is marked `FAILED`, and pending feature rows roll back. FastAPI uses its standard `{"detail": ...}` error envelope. Internal paths and exception details are not returned. Unsupported geometry types and bad individual geometries produce `measurement_status: "ERROR"`, `measurement_value: null`, and an `error` description. Features with invalid geometry parsing may have null `geometry`.

## Tests and quality checks

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .
.\.venv\Scripts\python -m pip check
```

Tests create small KML and Shapefile fixtures locally, use a temporary SQLite database, and require no network. They check upload validation, ZIP safety, CRS handling, projected measurements, feature-level errors, pagination, status, persistence, and 404 behavior. Regional and antimeridian tests compare with an independent WGS84 geodesic reference within 0.5%; this tolerance catches material projection error without asserting survey-grade accuracy. Other simple fixtures use broad physical plausibility ranges.

Frontend checks:

```powershell
cd frontend
npm ci
npm run test
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Frontend tests cover multipart requests and error parsing, upload validation and failed-record recovery, unit formatting, server pagination, and map rendering only from returned geometry. The ignored build output is `frontend/dist/`. The frontend uses React, TypeScript, Vite, Tailwind CSS, shadcn-style local UI components, Lucide, React Router, TanStack Query, Zod, React Leaflet, and Leaflet. Direct navigation to a file URL works with Vite's SPA fallback; other deployment servers must serve `index.html` for frontend routes.

## Layout and design decisions

### Processing flow

1. The React client sends a multipart `upload` field to FastAPI. The API validates the extension and body size, streams the upload into an isolated temporary directory, and validates ZIP contents or KML XML.
2. Fiona reads the selected Shapefile components, or the KML parser extracts Placemarks. The service records file metadata and each feature's ID, geometry, attributes, and source CRS.
3. The measurement module validates each geometry, transforms measurable features to a selected projected CRS, converts target units to metres or square metres, and records a value or an explicit error. A transaction persists the feature rows and final file status.
4. The UI retrieves persisted file and measurement pages. A separate map endpoint transforms valid, located geometries to WGS84 GeoJSON; the measurement endpoint retains source-coordinate geometry for compatibility.

```text
app/
  config.py       Environment settings
  database.py     SQLAlchemy engine and sessions
  models.py       Relational file and feature records
  schemas.py      Pydantic response contracts
  geo.py          KML/Shapefile parsing and CRS measurements
  service.py      Processing and persistence policy
  main.py         FastAPI routes and lifespan
  map_geometry.py WGS84 GeoJSON conversion for the map
  upload_limit.py Early multipart body limit
frontend/         React application and frontend tests
tests/            Isolated API and geospatial tests
samples/          Example KML and generated ZIP destination
scripts/          Sample Shapefile generator
```

Fiona reads Shapefiles from validated extracted components; direct Fiona iteration preserves feature IDs and avoids loading an entire GeoDataFrame. GeoPandas supplies UTM estimation, while Shapely and PyProj handle geometry and coordinate transformation. SQLite JSON columns store per-feature geometry and attributes, keeping file and feature rows relational and independently queryable. Synchronous processing keeps the assignment simple and ensures that a 201 response reflects finished processing, including a possible partial result. A background queue was deferred because the current upload contract completes within one request. A server-backed file list was chosen over browser-only history because records must remain available across sessions. A separate WGS84 map endpoint avoids changing the source-coordinate geometry already returned by the measurement contract.

### Limitations

KML supports simple Point, LineString, and Polygon Placemarks; KML `MultiGeometry`, tracks, and network links are reported as unsupported. Shapefile multipart geometries are supported. The backend does not return polygon perimeter; the UI reports only area or line length when present. No authentication or user isolation is provided: all stored files are visible to anyone who can reach the API. The health endpoint checks the app process, not database connectivity. The map renders at most 2,000 loaded features per view; the measurement table remains paginated across all features. Antimeridian geometry may wrap visually across the map even when its measurement succeeds. Browser-side tiles require internet connectivity; tests do not depend on tiles. Database schema changes need a migration tool before an existing database is upgraded. Python 3.12, PostgreSQL, and large ZIP expansion stress cases have not been exercised here.

### Learning outcomes and future scope

This project demonstrates why CRS provenance, geometry validation, bounded file extraction, per-feature diagnostics, and independent geodesic reference checks matter for trustworthy spatial APIs. It also shows the tradeoff between a simple synchronous API and the need for background processing at larger scale. Future work includes authenticated uploads and user isolation, explicit CRS overrides with provenance, schema migrations, background jobs, and server-side map simplification for very large datasets.
