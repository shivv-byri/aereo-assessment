import type { ProcessingStatus, MeasurementStatus } from "../../types/api";

export function StatusBadge({
  status,
}: {
  status: ProcessingStatus | MeasurementStatus;
}) {
  const label: Record<string, string> = {
    COMPLETED: "Completed",
    PARTIAL_SUCCESS: "Partial result",
    FAILED: "Failed",
    PROCESSING: "Processing",
    MEASURED: "Measured",
    NOT_APPLICABLE: "Not applicable",
    ERROR: "Error",
  };
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {label[status] || status}
    </span>
  );
}
