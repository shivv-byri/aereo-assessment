import type {
  FileInfo,
  FilePage,
  MapFeaturePage,
  MeasurementPage,
  UploadResult,
} from "../../types/api";
import type { z } from "zod";
import {
  fileInfoSchema,
  filePageSchema,
  healthSchema,
  mapFeaturePageSchema,
  measurementPageSchema,
  uploadResultSchema,
} from "./schemas";

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  status?: number;
  fileId?: string;
  constructor(message: string, status?: number, fileId?: string) {
    super(message);
    this.status = status;
    this.fileId = fileId;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(
  body: unknown,
  fallback: string,
): { message: string; fileId?: string } {
  if (!isObject(body)) return { message: fallback };
  const detail = body.detail;
  if (typeof detail === "string") return { message: detail };
  if (isObject(detail) && typeof detail.message === "string") {
    return {
      message: detail.message,
      fileId: typeof detail.file_id === "string" ? detail.file_id : undefined,
    };
  }
  return { message: fallback };
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  timeout = 20000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...init.headers },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = errorMessage(body, `Request failed (${response.status})`);
      throw new ApiError(detail.message, response.status, detail.fileId);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiError("The server returned an unexpected response");
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        "The request timed out or was cancelled. Please retry.",
      );
    throw new ApiError(
      "Cannot reach the AEREO API. Check that the backend is running.",
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

function params(input: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return `?${query}`;
}

export const api = {
  baseUrl,
  health: (signal?: AbortSignal) =>
    request("/health", healthSchema, { signal }, 8000),
  files: (
    query: {
      limit?: number;
      offset?: number;
      search?: string;
      status?: string;
    } = {},
    signal?: AbortSignal,
  ) =>
    request<FilePage>(`/api/files/${params(query)}`, filePageSchema, {
      signal,
    }),
  file: (id: string, signal?: AbortSignal) =>
    request<FileInfo>(`/api/files/${encodeURIComponent(id)}/`, fileInfoSchema, {
      signal,
    }),
  measurements: (
    id: string,
    query: {
      limit?: number;
      offset?: number;
      search?: string;
      geometry_type?: string;
      measurement_status?: string;
      sort?: string;
      direction?: string;
    } = {},
    signal?: AbortSignal,
  ) =>
    request<MeasurementPage>(
      `/api/files/${encodeURIComponent(id)}/measurements/${params(query)}`,
      measurementPageSchema,
      { signal },
    ),
  mapFeatures: (
    id: string,
    query: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ) =>
    request<MapFeaturePage>(
      `/api/files/${encodeURIComponent(id)}/features/geojson/${params(query)}`,
      mapFeaturePageSchema,
      { signal },
    ),
  upload: (file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("upload", file);
    return request<UploadResult>(
      "/api/files/",
      uploadResultSchema,
      { method: "POST", body: form, signal },
      120000,
    );
  },
};
