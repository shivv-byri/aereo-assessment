import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FileArchive,
  FileCode2,
  Map,
  RefreshCw,
  Ruler,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api/client";
import { formatDate, formatMeasurement, featureName } from "../lib/format";
import { ErrorPanel, LoadingPanel } from "../components/Feedback";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { MapExplorer } from "../features/map/MapExplorer";

export function FileDetail() {
  const { fileId = "" } = useParams();
  const queryClient = useQueryClient();
  const file = useQuery({
    queryKey: ["file", fileId],
    queryFn: ({ signal }) => api.file(fileId, signal),
    retry: false,
  });
  const sample = useQuery({
    queryKey: ["measurements", fileId, "preview"],
    queryFn: ({ signal }) => api.measurements(fileId, { limit: 5 }, signal),
    enabled: !!file.data,
  });
  const counts = useQueries({
    queries: ["MEASURED", "ERROR", "NOT_APPLICABLE"].map((status) => ({
      queryKey: ["measurement-count", fileId, status],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.measurements(
          fileId,
          { limit: 1, measurement_status: status },
          signal,
        ),
      enabled: !!file.data,
    })),
  });
  if (file.isPending) return <LoadingPanel label="Loading file details" />;
  if (file.error)
    return (
      <div className="content-narrow">
        <ErrorPanel
          title="File unavailable"
          message={file.error.message}
          retry={() => file.refetch()}
        />
        <Button asChild variant="secondary">
          <Link to="/files">
            <ArrowLeft size={16} /> File history
          </Link>
        </Button>
      </div>
    );
  const data = file.data;
  return (
    <div className="page-stack">
      <div className="detail-heading">
        <div>
          <Link className="back-link" to="/files">
            <ArrowLeft size={15} /> File history
          </Link>
          <div className="detail-title-line">
            <span className="detail-file-icon">
              {data.file_format === "kml" ? (
                <FileCode2 size={25} />
              ) : (
                <FileArchive size={25} />
              )}
            </span>
            <div>
              <div className="eyebrow">
                DATASET / {data.file_format === "kml" ? "KML" : "SHAPEFILE ZIP"}
              </div>
              <h1 title={data.original_filename}>{data.original_filename}</h1>
            </div>
          </div>
          <div className="detail-subtitle">
            <StatusBadge status={data.processing_status} />
            <span>Uploaded {formatDate(data.created_at)}</span>
          </div>
        </div>
        <div className="detail-actions">
          <Button
            variant="secondary"
            size="small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(data.id);
                toast.success("File ID copied");
              } catch {
                toast.error("Unable to copy file ID");
              }
            }}
          >
            <Copy size={16} /> Copy ID
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["file", fileId] })
            }
          >
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>
      </div>
      {(data.error_summary || data.processing_status === "FAILED") && (
        <div
          className={`outcome-banner ${data.processing_status === "FAILED" ? "failed" : "partial"}`}
          role="status"
        >
          <strong>
            {data.processing_status === "FAILED"
              ? "Processing failed"
              : "Some features need attention"}
          </strong>
          <span>
            {data.error_summary ||
              "The API did not complete processing. Review file format and source geometry before retrying."}
          </span>
          <Link to="/upload">
            Upload another file <ArrowRight size={15} />
          </Link>
        </div>
      )}
      <div className="metadata-grid">
        <div className="metadata-item">
          <span>Features</span>
          <strong>{data.feature_count.toLocaleString()}</strong>
        </div>
        <div className="metadata-item">
          <span>Source CRS</span>
          <strong>{data.source_crs || "Unknown"}</strong>
        </div>
        <div className="metadata-item">
          <span>Measured</span>
          <strong>{counts[0].data?.total ?? "—"}</strong>
        </div>
        <div className="metadata-item">
          <span>With errors</span>
          <strong>{counts[1].data?.total ?? "—"}</strong>
        </div>
      </div>
      <section className="card detail-map-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">SPATIAL VIEW</div>
            <h3>Feature map</h3>
          </div>
          <Button asChild variant="secondary" size="small">
            <Link to={`/map/${fileId}`}>
              <Map size={16} /> Open full map
            </Link>
          </Button>
        </div>
        <MapExplorer fileId={fileId} compact />
      </section>
      <section className="card preview-card">
        <div className="card-header">
          <div>
            <div className="eyebrow">SERVER RESULTS</div>
            <h3>Measurements</h3>
          </div>
          <Button asChild variant="secondary" size="small">
            <Link to={`/measurements/${fileId}`}>
              <Ruler size={16} /> View all <ArrowRight size={15} />
            </Link>
          </Button>
        </div>
        {sample.isPending ? (
          <LoadingPanel />
        ) : sample.error ? (
          <ErrorPanel
            message={sample.error.message}
            retry={() => sample.refetch()}
          />
        ) : sample.data.items.length ? (
          <div className="preview-list">
            {sample.data.items.map((item) => (
              <div className="preview-row" key={item.feature_index}>
                <span>
                  <strong>
                    {featureName(item.properties, item.feature_id)}
                  </strong>
                  <small>
                    {item.geometry_type} · {item.feature_id}
                  </small>
                </span>
                <span className="tabular">{formatMeasurement(item)}</span>
                <StatusBadge status={item.measurement_status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted card-padding">
            No feature measurements are stored for this file.
          </p>
        )}
      </section>
    </div>
  );
}
