import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api/client";
import { formatMeasurement } from "../lib/format";
import type { Measurement } from "../types/api";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  const validUpload = {
    id: "abc",
    original_filename: "sample.kml",
    file_format: "kml",
    source_crs: "EPSG:4326",
    feature_count: 1,
    processing_status: "COMPLETED",
    created_at: "2026-01-01T00:00:00Z",
    error_summary: null,
    file_url: "/api/files/abc/",
    measurements_url: "/api/files/abc/measurements/",
  };
  it("sends the backend multipart field without manually setting Content-Type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => validUpload });
    vi.stubGlobal("fetch", fetchMock);
    await api.upload(new File(["<kml/>"], "sample.kml"));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/files/");
    expect(options.body.get("upload").name).toBe("sample.kml");
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("rejects a malformed successful response before navigation can use it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ id: "abc" }) }),
    );
    await expect(
      api.upload(new File(["<kml/>"], "sample.kml")),
    ).rejects.toThrow("unexpected response");
  });

  it("rejects malformed map coordinates instead of handing them to Leaflet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          file_id: "abc",
          crs: "EPSG:4326",
          total: 1,
          limit: 500,
          offset: 0,
          items: [
            {
              feature_index: 0,
              feature_id: "bad",
              geometry_type: "Point",
              geometry: { type: "Point", coordinates: ["longitude", 12] },
              properties: {},
              error: null,
            },
          ],
        }),
      }),
    );
    await expect(api.mapFeatures("abc")).rejects.toThrow("unexpected response");
  });

  it("preserves a failed processing record ID from an API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: { message: "Malformed KML document", file_id: "failed-id" },
        }),
      }),
    );
    await expect(
      api.upload(new File(["bad"], "sample.kml")),
    ).rejects.toMatchObject({
      message: "Malformed KML document",
      status: 422,
      fileId: "failed-id",
    });
  });

  it("reports network failures without exposing underlying details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private internal path")),
    );
    await expect(api.health()).rejects.toThrow("Cannot reach the AEREO API");
  });

  it("encodes server pagination and filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        file_id: "file id",
        total: 0,
        limit: 25,
        offset: 25,
        items: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await api.measurements("file id", {
      limit: 25,
      offset: 25,
      search: "Site 1",
      geometry_type: "Point",
    });
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/api/files/file%20id/measurements/?",
    );
    expect(fetchMock.mock.calls[0][0]).toContain("offset=25");
    expect(fetchMock.mock.calls[0][0]).toContain("search=Site+1");
  });
});

describe("measurement display", () => {
  const base = {
    feature_index: 0,
    feature_id: "a",
    geometry_type: "Polygon",
    geometry: null,
    properties: {},
    source_crs: "EPSG:4326",
    projected_crs: "EPSG:32643",
    measurement_type: "area",
    measurement_unit: "m2",
    error: null,
  } as Measurement;
  it("labels known units and keeps unavailable distinct from zero", () => {
    expect(
      formatMeasurement({
        ...base,
        measurement_status: "MEASURED",
        measurement_value: 1_234_567,
      }),
    ).toBe("1,234,567 m²");
    expect(
      formatMeasurement({
        ...base,
        measurement_status: "MEASURED",
        measurement_value: 0,
      }),
    ).toBe("0 m²");
    expect(
      formatMeasurement({
        ...base,
        measurement_status: "ERROR",
        measurement_value: null,
      }),
    ).toBe("Unavailable");
    expect(
      formatMeasurement({
        ...base,
        measurement_status: "NOT_APPLICABLE",
        measurement_value: null,
      }),
    ).toBe("Not applicable");
  });
  it("renders metres for line length", () => {
    expect(
      formatMeasurement({
        ...base,
        geometry_type: "LineString",
        measurement_type: "length",
        measurement_unit: "m",
        measurement_status: "MEASURED",
        measurement_value: 1088,
      }),
    ).toBe("1,088 m");
  });
});
