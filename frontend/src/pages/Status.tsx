import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  FileArchive,
  FileCode2,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/api/client";
import { Button } from "../components/ui/button";

export function Status() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api.health(signal),
    retry: 1,
    refetchInterval: 60000,
  });
  const connected = health.data?.status === "ok";
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SYSTEM CONNECTION</div>
          <h1>API status</h1>
          <p>Connection details and the supported data workflow.</p>
        </div>
        <Button variant="secondary" onClick={() => health.refetch()}>
          <RefreshCw size={16} /> Check now
        </Button>
      </div>
      <div className="status-grid">
        <div className="card status-main">
          <div className={`status-large-icon ${connected ? "online" : ""}`}>
            <Activity size={27} />
          </div>
          <div>
            <div className="eyebrow">BACKEND HEALTH</div>
            <h2>
              {health.isPending
                ? "Checking connection"
                : connected
                  ? "Connected and ready"
                  : "Backend unavailable"}
            </h2>
            <p>
              {connected
                ? "The AEREO API responded to its health check."
                : health.isPending
                  ? "Contacting the configured API endpoint."
                  : health.error?.message || "Health check did not succeed."}
            </p>
            <div className="endpoint-line">
              <Server size={16} />
              <code>{api.baseUrl}</code>
            </div>
          </div>
        </div>
        <div className="card api-links">
          <div className="eyebrow">DEVELOPER RESOURCES</div>
          <h3>Explore the API</h3>
          <p>
            Open the generated FastAPI reference for live endpoint schemas and
            examples.
          </p>
          <a
            className="text-link"
            href={`${api.baseUrl}/docs`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open API documentation <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <div className="eyebrow">CAPABILITIES</div>
          <h2>What AEREO accepts</h2>
        </div>
      </div>
      <div className="capability-grid">
        <div className="card capability">
          <FileCode2 size={24} />
          <h3>KML documents</h3>
          <p>
            Geographic coordinates with point, line, and polygon features.
            Unsupported MultiGeometry is reported per feature.
          </p>
        </div>
        <div className="card capability">
          <FileArchive size={24} />
          <h3>Zipped Shapefiles</h3>
          <p>
            ZIP archives containing a usable Shapefile. Missing source CRS
            remains unknown; map placement and physical measurement may be
            unavailable.
          </p>
        </div>
        <div className="card capability">
          <ShieldCheck size={24} />
          <h3>Validated processing</h3>
          <p>
            The default upload cap is 20 MiB and the processing limit is 10,000
            features. The backend enforces both limits.
          </p>
        </div>
      </div>
      <p className="muted small-text">
        The browser receives only the API URL configured through
        VITE_API_BASE_URL. Do not place secrets in Vite environment variables.
      </p>
    </div>
  );
}
