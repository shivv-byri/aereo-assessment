from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class FileRecord(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    file_format: Mapped[str] = mapped_column(String(16))
    source_crs: Mapped[str | None] = mapped_column(Text)
    feature_count: Mapped[int] = mapped_column(Integer, default=0)
    processing_status: Mapped[str] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    error_summary: Mapped[str | None] = mapped_column(Text)


class FeatureRecord(Base):
    __tablename__ = "features"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id"), index=True)
    feature_index: Mapped[int] = mapped_column(Integer)
    feature_id: Mapped[str] = mapped_column(String(255))
    geometry_type: Mapped[str] = mapped_column(String(80))
    geometry: Mapped[dict | None] = mapped_column(JSON)
    properties: Mapped[dict] = mapped_column(JSON)
    source_crs: Mapped[str | None] = mapped_column(Text)
    projected_crs: Mapped[str | None] = mapped_column(Text)
    measurement_type: Mapped[str | None] = mapped_column(String(16))
    measurement_value: Mapped[float | None]
    measurement_unit: Mapped[str | None] = mapped_column(String(8))
    measurement_status: Mapped[str] = mapped_column(String(24))
    error: Mapped[str | None] = mapped_column(Text)
