import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { Shell } from "./app/Shell";
import { Overview } from "./pages/Overview";
import { Upload } from "./pages/Upload";
import { History } from "./pages/History";
import { Status } from "./pages/Status";
import { ErrorPanel, LoadingPanel } from "./components/Feedback";
import { ErrorBoundary } from "./components/ErrorBoundary";

const FileDetail = lazy(() =>
  import("./pages/FileDetail").then((module) => ({
    default: module.FileDetail,
  })),
);
const MapWorkspace = lazy(() =>
  import("./pages/MapWorkspace").then((module) => ({
    default: module.MapWorkspace,
  })),
);
const Measurements = lazy(() =>
  import("./pages/Measurements").then((module) => ({
    default: module.Measurements,
  })),
);

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<LoadingPanel />}>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Overview />} />
                <Route path="upload" element={<Upload />} />
                <Route path="files" element={<History />} />
                <Route path="files/:fileId" element={<FileDetail />} />
                <Route path="map" element={<MapWorkspace />} />
                <Route path="map/:fileId" element={<MapWorkspace />} />
                <Route path="measurements" element={<Measurements />} />
                <Route path="measurements/:fileId" element={<Measurements />} />
                <Route path="status" element={<Status />} />
                <Route
                  path="*"
                  element={
                    <ErrorPanel
                      title="Page not found"
                      message="This workspace page does not exist. Use the navigation to continue."
                    />
                  }
                />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
