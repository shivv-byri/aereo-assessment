import { Component, type ReactNode } from "react";
import { ErrorPanel } from "./Feedback";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="content-narrow">
          <ErrorPanel
            title="Workspace view failed"
            message="The current view could not be displayed. Reload the page to try again."
            retry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
