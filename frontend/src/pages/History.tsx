import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileArchive, FileCode2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api/client";
import { formatDate } from "../lib/format";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "../components/Feedback";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const PAGE_SIZE = 15;
export function History() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(input);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ["files", "history", search, status, page],
    queryFn: ({ signal }) =>
      api.files(
        { limit: PAGE_SIZE, offset: page * PAGE_SIZE, search, status },
        signal,
      ),
  });
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PERSISTED DATASETS</div>
          <h1>File history</h1>
          <p>
            Every accepted upload is stored by the API and available after a
            browser refresh.
          </p>
        </div>
        <Button asChild>
          <Link to="/upload">
            Upload file <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
      <div className="card table-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search filenames"
              aria-label="Search filenames"
            />
          </label>
          <select
            aria-label="Filter by processing status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PARTIAL_SUCCESS">Partial results</option>
            <option value="FAILED">Failed</option>
            <option value="PROCESSING">Processing</option>
          </select>
          <span className="toolbar-count">
            {query.data ? `${query.data.total} files` : "— files"}
          </span>
        </div>
        {query.isPending ? (
          <LoadingPanel label="Loading file history" />
        ) : query.error ? (
          <ErrorPanel
            message={query.error.message}
            retry={() => query.refetch()}
          />
        ) : !query.data.items.length ? (
          <EmptyPanel
            title={search || status ? "No matching files" : "No files yet"}
            description={
              search || status
                ? "Try another search or status filter."
                : "Upload a KML or zipped Shapefile to create your first record."
            }
            action={
              !search && !status ? (
                <Button asChild>
                  <Link to="/upload">Upload a file</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Format</th>
                    <th>Created</th>
                    <th>Features</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <Link
                          className="file-table-link"
                          to={`/files/${file.id}`}
                        >
                          <span className="file-mini-icon">
                            {file.file_format === "kml" ? (
                              <FileCode2 size={17} />
                            ) : (
                              <FileArchive size={17} />
                            )}
                          </span>
                          <span title={file.original_filename}>
                            {file.original_filename}
                          </span>
                        </Link>
                        {file.error_summary && (
                          <small className="row-note">
                            {file.error_summary}
                          </small>
                        )}
                      </td>
                      <td>
                        {file.file_format === "kml" ? "KML" : "Shapefile ZIP"}
                      </td>
                      <td>{formatDate(file.created_at)}</td>
                      <td className="tabular">{file.feature_count}</td>
                      <td>
                        <StatusBadge status={file.processing_status} />
                      </td>
                      <td>
                        <Link className="table-action" to={`/files/${file.id}`}>
                          Open <ArrowRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, query.data.total)} of{" "}
                {query.data.total}
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
                  disabled={(page + 1) * PAGE_SIZE >= query.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
