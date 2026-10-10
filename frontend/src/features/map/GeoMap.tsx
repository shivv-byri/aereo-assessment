import { useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  ScaleControl,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { MapFeature } from "../../types/api";

const tileUrl =
  import.meta.env.VITE_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function FitView({
  features,
  selectedId,
  fitRequest,
}: {
  features: MapFeature[];
  selectedId: number | null;
  fitRequest: number;
}) {
  const map = useMap();
  useEffect(() => {
    const candidates =
      selectedId === null
        ? features
        : features.filter((feature) => feature.feature_index === selectedId);
    const group = L.geoJSON(
      candidates
        .filter((feature) => feature.geometry)
        .map((feature) => ({
          type: "Feature",
          properties: {},
          geometry: feature.geometry!,
        })) as GeoJSON.Feature[],
    );
    const bounds = group.getBounds();
    if (bounds.isValid())
      map.fitBounds(bounds.pad(0.25), { maxZoom: 15, animate: false });
  }, [map, features, selectedId, fitRequest]);
  return null;
}

export function GeoMap({
  features,
  selectedId,
  onSelect,
  fitRequest = 0,
}: {
  features: MapFeature[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  fitRequest?: number;
}) {
  const [tileError, setTileError] = useState(false);
  const data = useMemo(
    () =>
      features
        .filter((feature) => feature.geometry)
        .map((feature) => ({
          type: "Feature" as const,
          id: feature.feature_index,
          properties: { feature_index: feature.feature_index },
          geometry: feature.geometry!,
        })),
    [features],
  );
  return (
    <div className="map-frame">
      <MapContainer
        center={[20, 20]}
        zoom={2}
        zoomControl
        scrollWheelZoom
        className="leaflet-map"
        preferCanvas
      >
        <TileLayer
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          eventHandlers={{
            tileerror: () => setTileError(true),
            tileload: () => setTileError(false),
          }}
        />
        <ScaleControl position="bottomleft" imperial={false} />
        {data.map((feature) => (
          <GeoJSON
            key={`${feature.id}-${selectedId === feature.id ? "selected" : "normal"}`}
            data={feature as GeoJSON.Feature}
            style={() => ({
              color: selectedId === feature.id ? "#e79a4a" : "#0d8f81",
              weight: selectedId === feature.id ? 5 : 3,
              fillColor: selectedId === feature.id ? "#e79a4a" : "#0d8f81",
              fillOpacity: selectedId === feature.id ? 0.38 : 0.2,
            })}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: selectedId === feature.id ? 10 : 7,
                color: "#fff",
                weight: 2,
                fillColor: selectedId === feature.id ? "#e79a4a" : "#0d8f81",
                fillOpacity: 1,
              })
            }
            eventHandlers={{ click: () => onSelect(Number(feature.id)) }}
          />
        ))}
        <FitView
          features={features}
          selectedId={selectedId}
          fitRequest={fitRequest}
        />
      </MapContainer>
      {tileError && (
        <div className="tile-warning" role="status">
          Basemap tiles are unavailable. Your geometry remains interactive.
        </div>
      )}
    </div>
  );
}
