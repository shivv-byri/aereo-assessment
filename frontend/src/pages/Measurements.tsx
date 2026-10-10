import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  MapPin,
  Ruler,
  Search,
  X,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api/client";
import { featureName, formatMeasurement } from "../lib/format";
import type { Measurement } from "../types/api";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "../components/Feedback";
import { FilePicker } from "../components/FilePicker";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const PAGE_SIZE = 25;
export function Measurements() {
  const { fileId } = useParams();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [geometry, setGeometry] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("feature_index");
  const [direction, setDirection] = useState("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Measurement | null>(null);
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(input);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);
  const file = useQuery({
    queryKey: ["file", fileId],
    queryFn: ({ signal }) => api.file(fileId!, signal),
    enabled: !!fileId,
    retry: false,
  });
  const result = useQuery({
    queryKey: [
      "measurements",
      fileId,
      page,
      search,
      geometry,
      status,
      sort,
      direction,
    ],
    queryFn: ({ signal }) =>
      api.measurements(
        fileId!,
        {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          search,
          geometry_type: geometry,
          measurement_status: status,
          sort,
          direction,
        },
        signal,
      ),
    enabled: !!fileId && !!file.data,
    placeholderData: keepPreviousData,
  });
  if (!fileId) return <FilePicker target="measurements" />;
  if (file.isPending) return <LoadingPanel label="Loading measurements" />;
  if (file.error)
    return (
      <ErrorPanel
        title="File unavailable"
        message={file.error.message}
        retry={() => file.refetch()}
      />
    );
  const changeSort = (field: string) => {
    setDirection(sort === field && direction === "asc" ? "desc" : "asc");
    setSort(field);
    setPage(0);
  };
  const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEASUREMENT WORKSPACE</div>
          <h1>Feature measurements</h1>
          <p>
            <Link to={`/files/${fileId}`}>{file.data.original_filename}</Link> ·{" "}
            {file.data.feature_count} source features ·{" "}
            {file.data.source_crs || "Source CRS unknown"}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to={`/map/${fileId}`}>
            <MapPin size={16} /> Open map
          </Link>
        </Button>
      </div>
      <div className="measurement-note">
        <Ruler size={18} />
        <span>
          Authoritative values come from the API. Polygon area is in square
          metres (m²); line length is in metres (m). A point has no physical
          measurement.
        </span>
      </div>
      <div className="card table-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search feature ID or name"
              placeholder="Search ID or name"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter geometry type"
            value={geometry}
            onChange={(event) => {
              setGeometry(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All geometries</option>
            {[
              "Polygon",
              "MultiPolygon",
              "LineString",
              "MultiLineString",
              "Point",
              "MultiPoint",
              "GeometryCollection",
            ].map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
          <select
            aria-label="Filter measurement status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All results</option>
            <option value="MEASURED">Measured</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
            <option value="ERROR">Errors</option>
          </select>
          <span className="toolbar-count">
            {result.data?.total ?? "—"} features
          </span>
        </div>
        {result.isPending ? (
          <LoadingPanel label="Loading feature measurements" />
        ) : result.error ? (
          <ErrorPanel
            message={result.error.message}
            retry={() => result.refetch()}
          />
        ) : !result.data.items.length ? (
          <EmptyPanel
            title="No matching features"
            description={
              file.data.feature_count
                ? "Try another search or filter. Measurement errors are retained as feature rows."
                : "This file has no stored feature results."
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button onClick={() => changeSort("feature_index")}>
                        # {sort === "feature_index" && <SortIcon size={13} />}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => changeSort("feature_id")}>
                        Feature{" "}
                        {sort === "feature_id" && <SortIcon size={13} />}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => changeSort("geometry_type")}>
                        Geometry{" "}
                        {sort === "geometry_type" && <SortIcon size={13} />}
                      </button>
                    </th>
                    <th>
                      <button onClick={() => changeSort("measurement_value")}>
                        Measurement{" "}
                        {sort === "measurement_value" && <SortIcon size={13} />}
                      </button>
                    </th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Inspect</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((item) => (
                    <tr key={item.feature_index}>
                      <td className="tabular">{item.feature_index + 1}</td>
                      <td>
                        <strong>
                          {featureName(item.properties, item.feature_id)}
                        </strong>
                        <small className="row-note">{item.feature_id}</small>
                      </td>
                      <td>{item.geometry_type}</td>
                      <td className="tabular measurement-cell">
                        {formatMeasurement(item)}
                      </td>
                      <td>
                        <StatusBadge status={item.measurement_status} />
                      </td>
                      <td>
                        <button
                          className="table-action"
                          onClick={() => setSelected(item)}
                        >
                          Inspect <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, result.data.total)} of{" "}
                {result.data.total}
                {result.isFetching ? " · Updating…" : ""}
              </span>
              <div>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="page-number">Page {page + 1}</span>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={(page + 1) * PAGE_SIZE >= result.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      {selected && (
        <div className="inspector-overlay" onClick={() => setSelected(null)}>
          <aside
            className="measurement-inspector"
            role="dialog"
            aria-modal="true"
            aria-label="Feature details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inspector-header">
              <div>
                <div className="eyebrow">FEATURE DETAIL</div>
                <h2>{featureName(selected.properties, selected.feature_id)}</h2>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close feature detail"
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </Button>
            </div>
            <div className="inspector-content">
              <StatusBadge status={selected.measurement_status} />
              <div className="inspector-value">
                <span>
                  {selected.measurement_type === "area"
                    ? "AREA"
                    : selected.measurement_type === "length"
                      ? "LENGTH"
                      : "MEASUREMENT"}
                </span>
                <strong>{formatMeasurement(selected)}</strong>
              </div>
              {selected.error && (
                <div className="inline-message error" role="status">
                  {selected.error}
                </div>
              )}
              <div className="detail-pair">
                <span>Feature ID</span>
                <code>{selected.feature_id}</code>
              </div>
              <div className="detail-pair">
                <span>Geometry</span>
                <strong>{selected.geometry_type}</strong>
              </div>
              <div className="detail-pair">
                <span>Source CRS</span>
                <strong>{selected.source_crs || "Unknown"}</strong>
              </div>
              <div className="detail-pair">
                <span>Measurement CRS</span>
                <strong>{selected.projected_crs || "Not available"}</strong>
              </div>
              <div className="attribute-label">ATTRIBUTES</div>
              {Object.entries(selected.properties).length ? (
                Object.entries(selected.properties).map(([key, value]) => (
                  <div key={key} className="detail-pair">
                    <span>{key}</span>
                    <strong>
                      {value === null
                        ? "—"
                        : typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="muted">No attributes stored.</p>
              )}
              <Button asChild variant="secondary" className="full-width">
                <Link to={`/map/${fileId}?feature=${selected.feature_index}`}>
                  View feature on map <ArrowRight size={16} />
                </Link>
              </Button>
              <p className="muted small-text">
                Map placement is available only for features with a known CRS
                and valid geometry.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
