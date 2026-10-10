import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FileCheck2,
  FileWarning,
  Files,
  MapPinned,
  Plus,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api/client";
import { formatDate } from "../lib/format";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "../components/Feedback";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const statuses = ["COMPLETED", "PARTIAL_SUCCESS", "FAILED"] as const;

export function Overview() {
  const recent = useQuery({
    queryKey: ["files", "recent"],
    queryFn: ({ signal }) => api.files({ limit: 5 }, signal),
  });
  const counts = useQueries({
    queries: statuses.map((status) => ({
      queryKey: ["files", "count", status],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.files({ limit: 1, status }, signal),
    })),
  });
  return (
    <div className="page-stack">
      <section className="overview-hero">
        <div className="overview-hero-copy">
          <div className="eyebrow light">SPATIAL DATA, MADE CLEAR</div>
          <h1>
            Measure with confidence.
            <br />
            <span>Explore with context.</span>
          </h1>
          <p>
            Bring KML and Shapefile datasets into one focused workspace. Inspect
            every geometry, understand processing outcomes, and use measurements
            calculated in projected metres.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link to="/upload">
                <Plus size={17} /> Upload spatial file
              </Link>
            </Button>
            <Link to="/files" className="text-link light-link">
              Browse file history <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="hero-graphic" aria-hidden="true">
          <div className="grid-orbit orbit-one" />
          <div className="grid-orbit orbit-two" />
          <div className="map-cross cross-one">+</div>
          <div className="map-cross cross-two">+</div>
          <div className="map-cross cross-three">+</div>
          <div className="hero-marker">
            <MapPinned size={26} />
          </div>
          <div className="hero-coordinate">12.9716° N &nbsp; 77.5946° E</div>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <div className="eyebrow">AT A GLANCE</div>
          <h2>Workspace overview</h2>
        </div>
        <span className="section-caption">Persisted server records</span>
      </div>
      {recent.isPending ? (
        <div className="metrics-grid">
          <LoadingPanel />
          <LoadingPanel />
          <LoadingPanel />
          <LoadingPanel />
        </div>
      ) : recent.error ? (
        <ErrorPanel
          message={recent.error.message}
          retry={() => recent.refetch()}
        />
      ) : (
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">
              <Files size={20} />
            </div>
            <span>Uploaded files</span>
            <strong>{recent.data.total}</strong>
            <small>All stored records</small>
          </div>
          {statuses.map((status, index) => (
            <div className="metric-card" key={status}>
              <div className={`metric-icon metric-${status.toLowerCase()}`}>
                {index === 0 ? (
                  <FileCheck2 size={20} />
                ) : (
                  <FileWarning size={20} />
                )}
              </div>
              <span>
                {index === 0
                  ? "Completed"
                  : index === 1
                    ? "Partial results"
                    : "Failed"}
              </span>
              <strong>{counts[index].data?.total ?? "—"}</strong>
              <small>
                {counts[index].error ? "Unavailable" : "Server count"}
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="overview-columns">
        <section className="card recent-card">
          <div className="card-header">
            <div>
              <div className="eyebrow">RECENT ACTIVITY</div>
              <h3>Latest files</h3>
            </div>
            <Link className="text-link" to="/files">
              View all <ArrowRight size={16} />
            </Link>
          </div>
          {recent.isPending ? (
            <LoadingPanel />
          ) : recent.error ? (
            <ErrorPanel
              message={recent.error.message}
              retry={() => recent.refetch()}
            />
          ) : recent.data.items.length ? (
            <div className="recent-list">
              {recent.data.items.map((file) => (
                <Link
                  className="recent-row"
                  key={file.id}
                  to={`/files/${file.id}`}
                >
                  <span className="file-symbol">
                    {file.file_format === "kml" ? "K" : "S"}
                  </span>
                  <span className="recent-file">
                    <strong>{file.original_filename}</strong>
                    <small>
                      {formatDate(file.created_at)} · {file.feature_count}{" "}
                      features
                    </small>
                  </span>
                  <StatusBadge status={file.processing_status} />
                  <ArrowRight size={16} className="row-arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="Your workspace is ready"
              description="Upload a KML or zipped Shapefile to start exploring real features and measurements."
              action={
                <Button asChild>
                  <Link to="/upload">Upload first file</Link>
                </Button>
              }
            />
          )}
        </section>
        <aside className="insight-card">
          <div className="eyebrow">WORKFLOW</div>
          <h3>From file to insight</h3>
          <div className="workflow-step">
            <span>01</span>
            <div>
              <strong>Upload</strong>
              <p>
                Submit KML or a zipped Shapefile. The API validates the dataset
                before storing it.
              </p>
            </div>
          </div>
          <div className="workflow-step">
            <span>02</span>
            <div>
              <strong>Inspect</strong>
              <p>
                Explore map-safe WGS84 geometries and review source attributes
                feature by feature.
              </p>
            </div>
          </div>
          <div className="workflow-step">
            <span>03</span>
            <div>
              <strong>Measure</strong>
              <p>
                Read server-calculated area in m² and line length in m, with
                explicit error states.
              </p>
            </div>
          </div>
          <div className="insight-foot">
            <ShieldCheck size={18} /> CRS-aware measurements <Ruler size={16} />
          </div>
        </aside>
      </div>
    </div>
  );
}
