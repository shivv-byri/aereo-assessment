import { z } from "zod";
import type {
  FileInfo,
  FilePage,
  MapFeaturePage,
  MeasurementPage,
  UploadResult,
} from "../../types/api";

const fileInfo = z.object({
  id: z.string().min(1),
  original_filename: z.string(),
  file_format: z.enum(["kml", "shapefile_zip"]),
  source_crs: z.string().nullable(),
  feature_count: z.number().int().nonnegative(),
  processing_status: z.enum([
    "PROCESSING",
    "COMPLETED",
    "PARTIAL_SUCCESS",
    "FAILED",
  ]),
  created_at: z.string(),
  error_summary: z.string().nullable(),
}) satisfies z.ZodType<FileInfo>;

export const fileInfoSchema: z.ZodType<FileInfo> = fileInfo;
export const uploadResultSchema: z.ZodType<UploadResult> = fileInfo.extend({
  file_url: z.string(),
  measurements_url: z.string(),
});

const pageFields = {
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
};
export const filePageSchema: z.ZodType<FilePage> = z.object({
  ...pageFields,
  items: z.array(fileInfo),
});

const geometry = z.record(z.string(), z.unknown()).nullable();
const properties = z.record(z.string(), z.unknown());
const measurement = z.object({
  feature_index: z.number().int().nonnegative(),
  feature_id: z.string(),
  geometry_type: z.string(),
  geometry,
  properties,
  source_crs: z.string().nullable(),
  projected_crs: z.string().nullable(),
  measurement_type: z.enum(["area", "length"]).nullable(),
  measurement_value: z.number().finite().nullable(),
  measurement_unit: z.enum(["m2", "m"]).nullable(),
  measurement_status: z.enum(["MEASURED", "NOT_APPLICABLE", "ERROR"]),
  error: z.string().nullable(),
});
export const measurementPageSchema: z.ZodType<MeasurementPage> = z.object({
  ...pageFields,
  file_id: z.string(),
  items: z.array(measurement),
});

const position = z.tuple([z.number().finite(), z.number().finite()]);
const mapGeometry: z.ZodType<GeoJSON.Geometry> = z.union([
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({ type: z.literal("MultiPoint"), coordinates: z.array(position) }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(position) }),
  z.object({
    type: z.literal("MultiLineString"),
    coordinates: z.array(z.array(position)),
  }),
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(position)),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(position))),
  }),
]);
const mapFeature = z.object({
  feature_index: z.number().int().nonnegative(),
  feature_id: z.string(),
  geometry_type: z.string(),
  geometry: mapGeometry.nullable(),
  properties,
  error: z.string().nullable(),
});
export const mapFeaturePageSchema: z.ZodType<MapFeaturePage> = z.object({
  ...pageFields,
  file_id: z.string(),
  crs: z.literal("EPSG:4326"),
  items: z.array(mapFeature),
});
export const healthSchema = z.object({ status: z.string() });
