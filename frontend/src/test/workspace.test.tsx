import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api } from "../lib/api/client";
import { History } from "../pages/History";
import { MapExplorer } from "../features/map/MapExplorer";
import type { FileInfo, MapFeaturePage } from "../types/api";

vi.mock("../features/map/GeoMap", () => ({
  GeoMap: ({ features }: { features: unknown[] }) => (
    <div data-testid="real-geometry-map">{features.length} geometries</div>
  ),
}));

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("server-backed workspaces", () => {
  it("paginates history using the server offset", async () => {
    const file: FileInfo = {
      id: "one",
      original_filename: "survey.kml",
      file_format: "kml",
      source_crs: "EPSG:4326",
      feature_count: 1,
      processing_status: "COMPLETED",
      created_at: "2026-01-01T00:00:00Z",
      error_summary: null,
    };
    const spy = vi.spyOn(api, "files").mockImplementation(async (query) => ({
      total: 30,
      limit: 15,
      offset: query?.offset || 0,
      items: Array.from({ length: 15 }, (_, index) => ({
        ...file,
        id: `${query?.offset || 0}-${index}`,
      })),
    }));
    wrap(<History />);
    await screen.findByText("Page 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 15, limit: 15 }),
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
  });

  it("shows only genuine returned map geometry and explains unmappable features", async () => {
    const page: MapFeaturePage = {
      file_id: "one",
      crs: "EPSG:4326",
      total: 2,
      limit: 500,
      offset: 0,
      items: [
        {
          feature_index: 0,
          feature_id: "point",
          geometry_type: "Point",
          geometry: { type: "Point", coordinates: [77, 12] },
          properties: { name: "Site" },
          error: null,
        },
        {
          feature_index: 1,
          feature_id: "unknown",
          geometry_type: "Point",
          geometry: null,
          properties: {},
          error: "Source CRS is unknown; geometry cannot be placed on the map",
        },
      ],
    };
    vi.spyOn(api, "mapFeatures").mockResolvedValue(page);
    wrap(<MapExplorer fileId="one" />);
    expect(await screen.findByTestId("real-geometry-map")).toHaveTextContent(
      "1 geometries",
    );
    fireEvent.click(screen.getByRole("button", { name: /unknown/i }));
    expect(screen.getByText(/Source CRS is unknown/)).toBeInTheDocument();
  });
});
