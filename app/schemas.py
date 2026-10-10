from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FileInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    file_format: str
    source_crs: str | None
    feature_count: int
    processing_status: str
    created_at: datetime
    error_summary: str | None

    @field_validator("created_at")
    @classmethod
    def normalize_utc(cls, value: datetime) -> datetime:
        # SQLite loses timezone metadata even for DateTime(timezone=True).
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class UploadResult(FileInfo):
    file_url: str
    measurements_url: str


class FeatureMeasurement(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    feature_index: int
    feature_id: str
    geometry_type: str
    geometry: dict[str, Any] | None
    properties: dict[str, Any]
    source_crs: str | None
    projected_crs: str | None
    measurement_type: str | None
    measurement_value: float | None
    measurement_unit: str | None
    measurement_status: str
    error: str | None


class MeasurementPage(BaseModel):
    file_id: str
    total: int
    limit: int = Field(ge=1, le=500)
    offset: int = Field(ge=0)
    items: list[FeatureMeasurement]


class FilePage(BaseModel):
    total: int
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    items: list[FileInfo]


class MapFeature(BaseModel):
    feature_index: int
    feature_id: str
    geometry_type: str
    geometry: dict[str, Any] | None
    properties: dict[str, Any]
    error: str | None


class MapFeaturePage(BaseModel):
    file_id: str
    crs: str = "EPSG:4326"
    total: int
    limit: int = Field(ge=1, le=500)
    offset: int = Field(ge=0)
    items: list[MapFeature]
