import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Layers3, LocateFixed, MapPin, MousePointer2 } from "lucide-react";
import { api } from "../../lib/api/client";
import { featureName } from "../../lib/format";
import type { MapFeature } from "../../types/api";
import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
} from "../../components/Feedback";
import { Button } from "../../components/ui/button";
import { GeoMap } from "./GeoMap";

const geometryGroups = [
  { label: "Polygons", kinds: ["Polygon", "MultiPolygon"], color: "polygon" },
  { label: "Lines", kinds: ["LineString", "MultiLineString"], color: "line" },
  { label: "Points", kinds: ["Point", "MultiPoint"], color: "point" },
];
const MAX_MAP_FEATURES = 2000;

export function MapExplorer({
  fileId,
  compact = false,
  initialFeature = null,
}: {
  fileId: string;
  compact?: boolean;
  initialFeature?: number | null;
}) {
  const [selected, setSelected] = useState<number | null>(initialFeature);
  const [visible, setVisible] = useState<string[]>(
    geometryGroups.map((group) => group.label),
  );
  const [fitRequest, setFitRequest] = useState(0);
  const query = useInfiniteQuery({
    queryKey: ["map", fileId, initialFeature],
    initialPageParam:
      initialFeature === null ? 0 : Math.floor(initialFeature / 500) * 500,
    queryFn: ({ pageParam, signal }) =>
      api.mapFeatures(fileId, { limit: 500, offset: pageParam }, signal),
    getNextPageParam: (page, pages) =>
      pages.reduce((count, current) => count + current.items.length, 0) <
        MAX_MAP_FEATURES && page.offset + page.items.length < page.total
        ? page.offset + page.items.length
        : undefined,
  });
  const all = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) || [],
    [query.data],
  );
  const rendered = all.filter(
    (feature) =>
      feature.geometry &&
      geometryGroups.some(
        (group) =>
          visible.includes(group.label) &&
          group.kinds.includes(feature.geometry_type),
      ),
  );
  const active =
    all.find((feature) => feature.feature_index === selected) || null;
  const unavailable = all.filter((feature) => !feature.geometry);
  if (query.isPending) return <LoadingPanel label="Loading map geometry" />;
  if (query.error)
    return (
      <ErrorPanel message={query.error.message} retry={() => query.refetch()} />
    );
  if (!all.length)
    return (
      <EmptyPanel
        title="No features to map"
        description="This file has no persisted features."
      />
    );
  return (
    <div className={`explorer ${compact ? "compact" : ""}`}>
      <div className="explorer-tools">
        <div className="explorer-label">
          <Layers3 size={17} /> Feature layers{" "}
          <span>
            {rendered.length} visible / {all.length} loaded
          </span>
        </div>
        <div className="layer-toggles">
          {geometryGroups.map((group) => (
            <label key={group.label} className="layer-toggle">
              <input
                type="checkbox"
                checked={visible.includes(group.label)}
                onChange={() =>
                  setVisible((current) =>
                    current.includes(group.label)
                      ? current.filter((item) => item !== group.label)
                      : [...current, group.label],
                  )
                }
              />
              <i className={`legend-swatch ${group.color}`} />
              {group.label}
            </label>
          ))}
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            setSelected(null);
            setFitRequest((value) => value + 1);
          }}
        >
          <LocateFixed size={15} /> Fit loaded
        </Button>
      </div>
      <div className="explorer-body">
        <div className="map-holder">
          {rendered.length ? (
            <GeoMap
              features={rendered}
              selectedId={selected}
              onSelect={setSelected}
              fitRequest={fitRequest}
            />
          ) : (
            <EmptyPanel
              title="No visible geometry"
              description="Enable a layer or review feature errors to see what can be mapped."
            />
          )}
        </div>
        <div className="feature-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">FEATURE INSPECTOR</div>
              <h3>
                {active
                  ? featureName(active.properties, active.feature_id)
                  : "Select a feature"}
              </h3>
            </div>
            <MousePointer2 size={17} />
          </div>
          {active ? (
            <FeatureDetails feature={active} />
          ) : (
            <p className="muted panel-hint">
              Select a geometry on the map or choose an item below to inspect
              its attributes.
            </p>
          )}
          <div className="feature-list-heading">
            FEATURES <span>{all.length}</span>
          </div>
          <div className="feature-list">
            {all.map((feature) => (
              <button
                key={feature.feature_index}
                type="button"
                className={`feature-item ${selected === feature.feature_index ? "selected" : ""}`}
                onClick={() => setSelected(feature.feature_index)}
              >
                <span
                  className={`feature-glyph ${feature.geometry ? "mapped" : "unmapped"}`}
                >
                  <MapPin size={15} />
                </span>
                <span>
                  <strong>
                    {featureName(feature.properties, feature.feature_id)}
                  </strong>
                  <small>
                    {feature.geometry_type}
                    {feature.error ? " · Map unavailable" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {unavailable.length > 0 && (
        <div className="map-note">
          {unavailable.length} loaded{" "}
          {unavailable.length === 1 ? "feature cannot" : "features cannot"} be
          placed on the map. Select a row for its reason.
        </div>
      )}
      {query.hasNextPage && (
        <div className="map-pagination">
          <span>
            Showing {all.length} of {query.data?.pages[0]?.total} stored
            features
          </span>
          <Button
            variant="secondary"
            size="small"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load 500 more"}
          </Button>
        </div>
      )}
      {!query.hasNextPage &&
        all.length < (query.data?.pages[0]?.total || 0) &&
        all.length >= MAX_MAP_FEATURES && (
          <div className="map-note">
            Map rendering is limited to {MAX_MAP_FEATURES.toLocaleString()}{" "}
            loaded features at once. Use the measurement table to inspect the
            remaining features.
          </div>
        )}
    </div>
  );
}

function FeatureDetails({ feature }: { feature: MapFeature }) {
  return (
    <div className="feature-details">
      <div className="detail-pair">
        <span>Feature ID</span>
        <code>{feature.feature_id}</code>
      </div>
      <div className="detail-pair">
        <span>Geometry</span>
        <strong>{feature.geometry_type}</strong>
      </div>
      {feature.error && (
        <p className="feature-error" role="status">
          {feature.error}
        </p>
      )}
      <div className="attribute-label">ATTRIBUTES</div>
      {Object.keys(feature.properties).length ? (
        Object.entries(feature.properties).map(([key, value]) => (
          <div className="detail-pair" key={key}>
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
    </div>
  );
}
