from pathlib import Path
from uuid import uuid4

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.geo import DatasetError, ParsedDataset, geometry_json, measure, read_kml, read_zip
from app.models import FeatureRecord, FileRecord


class ProcessingError(RuntimeError):
    def __init__(self, file_id: str):
        super().__init__("Unexpected processing failure")
        self.file_id = file_id


def process_file(
    session: Session, path: Path, original_filename: str, file_format: str
) -> FileRecord:
    record = FileRecord(
        id=str(uuid4()),
        original_filename=original_filename,
        file_format=file_format,
        processing_status="PROCESSING",
    )
    session.add(record)
    session.commit()
    try:
        dataset = read_kml(path) if file_format == "kml" else read_zip(path)
        _store_dataset(session, record, dataset)
    except DatasetError as exc:
        session.rollback()
        record = session.get(FileRecord, record.id)
        record.processing_status = "FAILED"
        record.error_summary = str(exc)
        session.commit()
        return record
    except SQLAlchemyError:
        session.rollback()
        # A recoverable write error should not leave an accepted file as PROCESSING.
        try:
            failed = session.get(FileRecord, record.id)
            if failed is not None:
                failed.processing_status = "FAILED"
                failed.error_summary = "Database operation failed"
                session.commit()
        except SQLAlchemyError:
            session.rollback()
        raise
    except Exception as exc:
        # Keep the accepted file's status honest; pending feature rows roll back.
        session.rollback()
        record = session.get(FileRecord, record.id)
        record.processing_status = "FAILED"
        record.error_summary = "Unexpected processing failure"
        session.commit()
        raise ProcessingError(record.id) from exc
    return record


def _store_dataset(session: Session, record: FileRecord, dataset: ParsedDataset) -> None:
    record.source_crs = dataset.source_crs
    record.feature_count = len(dataset.features)
    failed = 0
    for feature in dataset.features:
        if feature.error:
            measurement_type = value = unit = projected_crs = None
            status, error = "ERROR", feature.error
        else:
            measurement_type, value, unit, projected_crs, status, error = measure(
                feature.geometry, dataset.source_crs
            )
        failed += status == "ERROR"
        session.add(
            FeatureRecord(
                file_id=record.id,
                feature_index=feature.index,
                feature_id=feature.feature_id[:255],
                geometry_type=feature.geometry_type,
                geometry=geometry_json(feature.geometry),
                properties=feature.properties,
                source_crs=dataset.source_crs,
                projected_crs=projected_crs,
                measurement_type=measurement_type,
                measurement_value=value,
                measurement_unit=unit,
                measurement_status=status,
                error=error,
            )
        )
    if failed == record.feature_count:
        record.processing_status = "FAILED"
    elif failed:
        record.processing_status = "PARTIAL_SUCCESS"
    else:
        record.processing_status = "COMPLETED"
    if failed:
        record.error_summary = (
            f"{failed} of {record.feature_count} features could not be measured or parsed"
        )
    session.commit()
