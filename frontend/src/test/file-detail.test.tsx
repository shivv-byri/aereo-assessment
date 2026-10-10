import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../lib/api/client";
import { FileDetail } from "../pages/FileDetail";
import { StatusBadge } from "../components/ui/badge";

vi.mock("../features/map/MapExplorer", () => ({
  MapExplorer: () => <div>Map workspace</div>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders completed, partial, and failed status labels", () => {
  render(
    <>
      <StatusBadge status="COMPLETED" />
      <StatusBadge status="PARTIAL_SUCCESS" />
      <StatusBadge status="FAILED" />
    </>,
  );
  expect(screen.getByText("Completed")).toBeInTheDocument();
  expect(screen.getByText("Partial result")).toBeInTheDocument();
  expect(screen.getByText("Failed")).toBeInTheDocument();
});

it("reopens a persisted partial file by ID and explains its processing error", async () => {
  const file = {
    id: "persisted-file",
    original_filename: "mixed.kml",
    file_format: "kml",
    source_crs: "EPSG:4326",
    feature_count: 2,
    processing_status: "PARTIAL_SUCCESS",
    created_at: "2026-01-01T00:00:00Z",
    error_summary: "1 of 2 features could not be measured",
  } as const;
  vi.spyOn(api, "file").mockResolvedValue(file);
  vi.spyOn(api, "measurements").mockResolvedValue({
    file_id: file.id,
    total: 0,
    limit: 5,
    offset: 0,
    items: [],
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/files/persisted-file"]}>
        <Routes>
          <Route path="/files/:fileId" element={<FileDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("heading", { name: "mixed.kml" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("1 of 2 features could not be measured"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Open full map/i })).toHaveAttribute(
    "href",
    "/map/persisted-file",
  );
});
