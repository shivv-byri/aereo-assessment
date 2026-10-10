import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  FileBarChart2,
  FolderClock,
  LayoutDashboard,
  Map,
  Menu,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../lib/api/client";
import { Button } from "../components/ui/button";

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/upload", label: "Upload Files", icon: Plus },
  { to: "/map", label: "Map Workspace", icon: Map },
  { to: "/measurements", label: "Measurements", icon: FileBarChart2 },
  { to: "/files", label: "File History", icon: FolderClock },
  { to: "/status", label: "API Status", icon: Activity },
];

export function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api.health(signal),
    retry: 1,
    refetchInterval: 60000,
  });
  const active = links.find((link) =>
    link.end
      ? location.pathname === link.to
      : location.pathname.startsWith(link.to),
  );
  const connected = health.data?.status === "ok";
  const nav = (
    <>
      <div className="brand">
        <div className="brand-mark">
          <Compass size={23} strokeWidth={1.8} />
        </div>
        <div className="brand-copy">
          <strong>AEREO</strong>
          <small>GEOSPATIAL STUDIO</small>
        </div>
      </div>
      <div className="nav-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Primary navigation">
        {links.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="nav-section-label">SYSTEM</div>
        <NavLink
          to="/status"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          title="API Status"
        >
          <Activity size={19} />
          <span>API Status</span>
        </NavLink>
        <div className="sidebar-separator" />
        <div className="connection">
          <span
            className={`connection-dot ${connected ? "connected" : health.isPending ? "checking" : "offline"}`}
          />
          <span>
            {connected
              ? "API connected"
              : health.isPending
                ? "Checking API"
                : "API unavailable"}
          </span>
        </div>
        <div className="sidebar-version">AEREO / 1.0</div>
      </div>
    </>
  );
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        {nav}
        <button
          className="collapse-control"
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>{active?.label || "File workspace"}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`topbar-health ${connected ? "good" : ""}`}>
              <span className="connection-dot" />
              {connected
                ? "Connected"
                : health.isPending
                  ? "Checking"
                  : "Offline"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Refresh data"
              title="Refresh data"
              onClick={() => queryClient.invalidateQueries()}
            >
              <RefreshCw size={17} />
            </Button>
            <Button asChild size="small">
              <Link to="/upload">
                <Plus size={16} /> New upload
              </Link>
            </Button>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            <Database size={14} /> Measurements from the AEREO API
          </span>
          <a
            href={`${api.baseUrl}/docs`}
            target="_blank"
            rel="noopener noreferrer"
          >
            API documentation <ArrowUpRight size={14} />
          </a>
        </footer>
      </div>
    </div>
  );
}
