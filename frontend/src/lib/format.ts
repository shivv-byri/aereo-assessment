import type { Measurement } from "../types/api";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

export function formatMeasurement(item: Measurement): string {
  if (item.measurement_status === "ERROR") return "Unavailable";
  if (
    item.measurement_status === "NOT_APPLICABLE" ||
    item.measurement_value === null
  )
    return "Not applicable";
  return `${formatNumber(item.measurement_value)} ${item.measurement_unit === "m2" ? "m²" : "m"}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function featureName(
  properties: Record<string, unknown>,
  fallback: string,
): string {
  const name = properties.name;
  return typeof name === "string" && name.trim() ? name : fallback;
}

export function formatBytes(value: number): string {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KiB`
    : `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}
