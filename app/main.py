import codecs
import tempfile
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import make_database
from app.map_geometry import to_map_geometry
from app.models import Base, FeatureRecord, FileRecord
from app.schemas import (
    FileInfo,
    FilePage,
    MapFeature,
    MapFeaturePage,
    MeasurementPage,
    UploadResult,
)
from app.service import ProcessingError, process_file
from app.upload_limit import UploadBodyLimit


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine, session_factory = make_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="AEREO Geospatial Measurement API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(UploadBodyLimit, max_upload_bytes=settings.max_upload_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Accept", "Content-Type"],
    )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(_request: Request, _error: SQLAlchemyError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Database operation failed"})

    @app.exception_handler(ProcessingError)
    async def processing_error(_request: Request, error: ProcessingError) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": {"message": "Processing failed", "file_id": error.file_id}},
        )

    def get_session():
        with session_factory() as session:
            yield session

    SessionDep = Annotated[Session, Depends(get_session)]

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/files/", response_model=FilePage)
    def list_files(
        session: SessionDep,
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        offset: Annotated[int, Query(ge=0)] = 0,
        search: str | None = Query(default=None, max_length=255),
        status: str | None = Query(
            default=None, pattern="^(PROCESSING|COMPLETED|PARTIAL_SUCCESS|FAILED)$"
        ),
    ) -> FilePage:
        filters = []
        if search:
            filters.append(FileRecord.original_filename.ilike(f"%{search}%"))
        if status:
            filters.append(FileRecord.processing_status == status)
        total = session.scalar(select(func.count()).select_from(FileRecord).where(*filters)) or 0
        items = session.scalars(
            select(FileRecord)
            .where(*filters)
            .order_by(FileRecord.created_at.desc(), FileRecord.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return FilePage(total=total, limit=limit, offset=offset, items=items)

    @app.post("/api/files/", response_model=UploadResult, status_code=201)
    def upload_file(upload: Annotated[UploadFile, File()], session: SessionDep) -> UploadResult:
        original = (upload.filename or "").replace("\\", "/").split("/")[-1][:255]
        extension = Path(original).suffix.lower()
        if extension not in {".kml", ".zip"}:
            raise HTTPException(
                415, detail="Only .kml and zipped Shapefile .zip uploads are supported"
            )
        file_format = "kml" if extension == ".kml" else "shapefile_zip"
        with tempfile.TemporaryDirectory(prefix="aereo-upload-") as directory:
            path = Path(directory) / ("input" + extension)
            size = 0
            with path.open("wb") as destination:
                while chunk := upload.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_bytes:
                        raise HTTPException(413, detail="Upload exceeds configured size limit")
                    destination.write(chunk)
            if size == 0:
                raise HTTPException(400, detail="Upload is empty")
            if extension == ".zip" and not zipfile.is_zipfile(path):
                raise HTTPException(400, detail="Invalid ZIP archive")
            if extension == ".kml":
                with path.open("rb") as source:
                    prefix = source.read(256)
                utf16 = prefix.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE))
                xml_start = prefix.lstrip(b"\xef\xbb\xbf\x20\r\n\t").startswith(b"<")
                if not (utf16 or xml_start):
                    raise HTTPException(400, detail="File does not contain KML XML")
            try:
                record = process_file(session, path, original, file_format)
            except SQLAlchemyError as exc:
                session.rollback()
                raise HTTPException(503, detail="Database operation failed") from exc
        if record.processing_status == "FAILED":
            raise HTTPException(422, detail={"message": record.error_summary, "file_id": record.id})
        return UploadResult(
            **FileInfo.model_validate(record).model_dump(),
            file_url=f"/api/files/{record.id}/",
            measurements_url=f"/api/files/{record.id}/measurements/",
        )

    @app.get("/api/files/{file_id}/", response_model=FileInfo)
    def get_file(file_id: str, session: SessionDep) -> FileInfo:
        record = session.get(FileRecord, file_id)
        if record is None:
            raise HTTPException(404, detail="File not found")
        return FileInfo.model_validate(record)

    @app.get("/api/files/{file_id}/measurements/", response_model=MeasurementPage)
    def get_measurements(
        file_id: str,
        session: SessionDep,
        limit: Annotated[int, Query(ge=1, le=500)] = 100,
        offset: Annotated[int, Query(ge=0)] = 0,
        search: str | None = Query(default=None, max_length=255),
        geometry_type: str | None = Query(default=None, max_length=80),
        measurement_status: str | None = Query(
            default=None, pattern="^(MEASURED|NOT_APPLICABLE|ERROR)$"
        ),
        sort: str = Query(
            default="feature_index",
            pattern="^(feature_index|feature_id|geometry_type|measurement_value)$",
        ),
        direction: str = Query(default="asc", pattern="^(asc|desc)$"),
    ) -> MeasurementPage:
        if session.get(FileRecord, file_id) is None:
            raise HTTPException(404, detail="File not found")
        filters = [FeatureRecord.file_id == file_id]
        if search:
            filters.append(
                or_(
                    FeatureRecord.feature_id.ilike(f"%{search}%"),
                    FeatureRecord.properties["name"].as_string().ilike(f"%{search}%"),
                )
            )
        if geometry_type:
            filters.append(FeatureRecord.geometry_type == geometry_type)
        if measurement_status:
            filters.append(FeatureRecord.measurement_status == measurement_status)
        total = session.scalar(select(func.count()).select_from(FeatureRecord).where(*filters)) or 0
        sort_column = getattr(FeatureRecord, sort)
        ordering = sort_column.desc() if direction == "desc" else sort_column.asc()
        items = session.scalars(
            select(FeatureRecord)
            .where(*filters)
            .order_by(ordering, FeatureRecord.feature_index)
            .limit(limit)
            .offset(offset)
        ).all()
        return MeasurementPage(
            file_id=file_id, total=total, limit=limit, offset=offset, items=items
        )

    @app.get("/api/files/{file_id}/features/geojson/", response_model=MapFeaturePage)
    def get_map_features(
        file_id: str,
        session: SessionDep,
        limit: Annotated[int, Query(ge=1, le=500)] = 500,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> MapFeaturePage:
        if session.get(FileRecord, file_id) is None:
            raise HTTPException(404, detail="File not found")
        total = (
            session.scalar(
                select(func.count())
                .select_from(FeatureRecord)
                .where(FeatureRecord.file_id == file_id)
            )
            or 0
        )
        rows = session.scalars(
            select(FeatureRecord)
            .where(FeatureRecord.file_id == file_id)
            .order_by(FeatureRecord.feature_index)
            .limit(limit)
            .offset(offset)
        ).all()
        items = []
        for row in rows:
            geometry, error = to_map_geometry(row.geometry, row.source_crs)
            items.append(
                MapFeature(
                    feature_index=row.feature_index,
                    feature_id=row.feature_id,
                    geometry_type=row.geometry_type,
                    geometry=geometry,
                    properties=row.properties,
                    error=error,
                )
            )
        return MapFeaturePage(file_id=file_id, total=total, limit=limit, offset=offset, items=items)

    return app


app = create_app()
