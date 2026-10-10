import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api/client";
import { ErrorPanel, LoadingPanel } from "../components/Feedback";
import { FilePicker } from "../components/FilePicker";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { MapExplorer } from "../features/map/MapExplorer";

export function MapWorkspace() {
  const { fileId } = useParams();
  const [searchParams] = useSearchParams();
  const value = Number(searchParams.get("feature"));
  const initialFeature =
    searchParams.has("feature") && Number.isInteger(value) && value >= 0
      ? value
      : null;
  const file = useQuery({
    queryKey: ["file", fileId],
    queryFn: ({ signal }) => api.file(fileId!, signal),
    enabled: !!fileId,
    retry: false,
  });
  if (!fileId) return <FilePicker target="map" />;
  if (file.isPending) return <LoadingPanel label="Loading map workspace" />;
  if (file.error)
    return (
      <ErrorPanel
        title="Map unavailable"
        message={file.error.message}
        retry={() => file.refetch()}
      />
    );
  return (
    <div className="page-stack map-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            MAP WORKSPACE /{" "}
            {file.data.file_format === "kml" ? "KML" : "SHAPEFILE ZIP"}
          </div>
          <h1>{file.data.original_filename}</h1>
          <p>
            Interactive WGS84 view of persisted geometry. Select a feature to
            inspect its attributes.
          </p>
        </div>
        <div className="page-heading-actions">
          <StatusBadge status={file.data.processing_status} />
          <Button
            variant="secondary"
            size="small"
            onClick={() => file.refetch()}
          >
            <RefreshCw size={16} /> Refresh
          </Button>
          <Button asChild size="small">
            <Link to={`/measurements/${fileId}`}>
              Measurements <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </div>
      <div className="card map-workspace-card">
        <MapExplorer fileId={fileId} initialFeature={initialFeature} />
      </div>
      <p className="muted small-text">
        Map positions are transformed by the API into EPSG:4326. Measurements
        shown elsewhere are calculated in projected metres. Features without a
        known CRS or valid geometry are omitted from the map with a reason.
      </p>
    </div>
  );
}
