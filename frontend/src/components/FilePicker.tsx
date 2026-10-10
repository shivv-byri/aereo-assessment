import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api/client";
import { Button } from "./ui/button";

export function FilePicker({ target }: { target: "map" | "measurements" }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["files", "picker"],
    queryFn: ({ signal }) => api.files({ limit: 100 }, signal),
  });
  return (
    <div className="content-narrow">
      <div className="eyebrow">SELECT A DATASET</div>
      <h2>Choose a file to explore</h2>
      <p className="muted">
        Open a persisted file from your history, or upload a new dataset.
      </p>
      <div className="card picker-list">
        {isPending ? (
          <p className="muted">Loading files…</p>
        ) : error ? (
          <p role="alert">
            {error.message}{" "}
            <Button variant="ghost" onClick={() => refetch()}>
              Retry
            </Button>
          </p>
        ) : data?.items.length ? (
          data.items.map((file) => (
            <Link
              key={file.id}
              className="picker-row"
              to={`/${target}/${file.id}`}
            >
              <span>
                <strong>{file.original_filename}</strong>
                <small>
                  {file.feature_count} features ·{" "}
                  {file.file_format === "kml" ? "KML" : "Shapefile ZIP"}
                </small>
              </span>
              <span aria-hidden>↗</span>
            </Link>
          ))
        ) : (
          <p className="muted">No files are stored yet.</p>
        )}
      </div>
      {data && data.total > data.items.length && (
        <p className="muted">
          Showing the latest {data.items.length} of {data.total} files. Search
          all files in <Link to="/files">File History</Link>.
        </p>
      )}
      <Button asChild>
        <Link to="/upload">Upload a file</Link>
      </Button>
    </div>
  );
}
