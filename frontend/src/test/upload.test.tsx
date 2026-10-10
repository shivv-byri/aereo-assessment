import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api, ApiError } from "../lib/api/client";
import { Upload } from "../pages/Upload";

const renderUpload = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemoryRouter>
        <Upload />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("upload workflow", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);
  it("rejects unsupported files before requesting the API", () => {
    const spy = vi.spyOn(api, "upload");
    renderUpload();
    fireEvent.change(screen.getByLabelText("Upload spatial file"), {
      target: { files: [new File(["x"], "data.txt")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Only .kml and .zip");
    expect(spy).not.toHaveBeenCalled();
  });
  it("shows a failed backend record and a recovery link", async () => {
    vi.spyOn(api, "upload").mockRejectedValue(
      new ApiError("Malformed KML document", 422, "failed-id"),
    );
    renderUpload();
    fireEvent.change(screen.getByLabelText("Upload spatial file"), {
      target: { files: [new File(["<kml>"], "bad.kml")] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Upload & process/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Malformed KML document",
      ),
    );
    expect(
      screen.getByRole("link", { name: "View failed record" }),
    ).toHaveAttribute("href", "/files/failed-id");
  });
});
