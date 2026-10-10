import type { ReactNode } from "react";
import { AlertCircle, Inbox, RotateCw } from "lucide-react";
import { Button } from "./ui/button";

export function LoadingPanel({
  label = "Loading workspace",
}: {
  label?: string;
}) {
  return (
    <div className="surface-state" role="status">
      <div className="skeleton skeleton-icon" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
export function EmptyPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-state">
      <div className="state-icon">
        <Inbox size={22} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorPanel({
  title = "Unable to load data",
  message,
  retry,
}: {
  title?: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="surface-state error-state" role="alert">
      <div className="state-icon">
        <AlertCircle size={22} />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          <RotateCw size={16} /> Retry
        </Button>
      )}
    </div>
  );
}
