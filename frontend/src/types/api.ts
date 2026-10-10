export type ProcessingStatus =
  "PROCESSING" | "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED";
export type MeasurementStatus = "MEASURED" | "NOT_APPLICABLE" | "ERROR";

export interface FileInfo {
  id: string;
  original_filename: string;
  file_format: "kml" | "shapefile_zip";
  source_crs: string | null;
  feature_count: number;
  processing_status: ProcessingStatus;
  created_at: string;
  error_summary: string | null;
}

export interface UploadResult extends FileInfo {
  file_url: string;
  measurements_url: string;
}

export interface Page<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export type FilePage = Page<FileInfo>;

export interface Measurement {
  feature_index: number;
  feature_id: string;
  geometry_type: string;
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
  source_crs: string | null;
  projected_crs: string | null;
  measurement_type: "area" | "length" | null;
  measurement_value: number | null;
  measurement_unit: "m2" | "m" | null;
  measurement_status: MeasurementStatus;
  error: string | null;
}

export interface MeasurementPage extends Page<Measurement> {
  file_id: string;
}

export interface MapFeature {
  feature_index: number;
  feature_id: string;
  geometry_type: string;
  geometry: GeoJSON.Geometry | null;
  properties: Record<string, unknown>;
  error: string | null;
}

export interface MapFeaturePage extends Page<MapFeature> {
  file_id: string;
  crs: "EPSG:4326";
}
