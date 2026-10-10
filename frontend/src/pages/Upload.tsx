import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  FileArchive,
  FileCode2,
  FileUp,
  Info,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { z } from "zod";
import { ApiError, api } from "../lib/api/client";
import { formatBytes } from "../lib/format";
import { Button } from "../components/ui/button";

const fileSchema = z
  .custom<File>((value) => value instanceof File, "Choose a file to upload")
  .refine(
    (file) => /\.(kml|zip)$/i.test(file.name),
    "Only .kml and .zip files are supported",
  )
  .refine((file) => file.size > 0, "The file is empty")
  .refine(
    (file) => file.size <= 20 * 1024 * 1024,
    "The file exceeds the default 20 MiB limit",
  );

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (selected: File) => api.upload(selected),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      navigate(`/files/${result.id}`);
    },
  });
  const select = (candidate?: File) => {
    mutation.reset();
    const parsed = fileSchema.safeParse(candidate);
    if (!parsed.success) {
      setFile(null);
      setValidation(parsed.error.issues[0]?.message || "Invalid file");
      return;
    }
    setValidation("");
    setFile(parsed.data);
  };
  const error = mutation.error instanceof ApiError ? mutation.error : null;
  return (
    <div className="page-stack upload-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">IMPORT DATASET</div>
          <h1>Upload spatial data</h1>
          <p>
            Bring your source file into AEREO. Processing happens on the server
            before a result is returned.
          </p>
        </div>
      </div>
      <div className="upload-layout">
        <div className="card upload-card">
          <div className="card-header">
            <div>
              <div className="eyebrow">NEW FILE</div>
              <h3>Select a dataset</h3>
            </div>
            <span className="step-count">01 / 02</span>
          </div>
          <input
            ref={input}
            className="sr-only"
            id="upload-input"
            aria-label="Upload spatial file"
            type="file"
            accept=".kml,.zip"
            onChange={(event) => select(event.target.files?.[0])}
          />
          <div
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Choose KML or ZIP file"
            onClick={() => input.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                input.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              select(event.dataTransfer.files[0]);
            }}
          >
            <div className="drop-icon">
              <FileUp size={27} strokeWidth={1.6} />
            </div>
            <strong>Drop a file here, or browse your computer</strong>
            <span>
              KML or ZIP containing a Shapefile · Default limit 20 MiB
            </span>
            <span
              className="button button-secondary button-default"
              aria-hidden="true"
            >
              Browse files
            </span>
          </div>
          {validation && (
            <div className="inline-message error" role="alert">
              <Info size={17} /> {validation}
            </div>
          )}
          {file && (
            <div className="selected-file">
              <span className="selected-icon">
                {file.name.toLowerCase().endsWith(".kml") ? (
                  <FileCode2 size={20} />
                ) : (
                  <FileArchive size={20} />
                )}
              </span>
              <span>
                <strong>{file.name}</strong>
                <small>{formatBytes(file.size)} · Ready to upload</small>
              </span>
              <button
                type="button"
                aria-label="Remove selected file"
                onClick={() => {
                  setFile(null);
                  if (input.current) input.current.value = "";
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {mutation.isPending && (
            <div className="processing-box" role="status">
              <div className="indeterminate-bar" />
              <strong>Uploading and processing your file…</strong>
              <p>
                The API validates the archive, stores features, and computes
                measurements in this request. Large datasets may take a moment.
              </p>
            </div>
          )}
          {error && (
            <div className="inline-message error" role="alert">
              <Info size={18} />
              <span>
                <strong>Upload could not be completed.</strong> {error.message}
                {error.fileId && (
                  <>
                    {" "}
                    <Link to={`/files/${error.fileId}`}>
                      View failed record
                    </Link>
                    .
                  </>
                )}
              </span>
            </div>
          )}
          <div className="upload-actions">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setFile(null);
                setValidation("");
                mutation.reset();
                if (input.current) input.current.value = "";
              }}
            >
              <RotateCcw size={16} /> Reset
            </Button>
            <Button
              type="button"
              disabled={!file || mutation.isPending}
              onClick={() => file && mutation.mutate(file)}
            >
              {mutation.isPending ? "Processing…" : "Upload & process"}{" "}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
        <aside className="upload-aside">
          <div className="card guidance-card">
            <div className="eyebrow">SUPPORTED FORMATS</div>
            <div className="format-row">
              <FileCode2 size={20} />
              <div>
                <strong>KML</strong>
                <small>.kml · geographic coordinates</small>
              </div>
              <Check size={16} />
            </div>
            <div className="format-row">
              <FileArchive size={20} />
              <div>
                <strong>Zipped Shapefile</strong>
                <small>.zip · .shp, .shx and .dbf required</small>
              </div>
              <Check size={16} />
            </div>
          </div>
          <div className="guidance-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Measured with CRS awareness</strong>
              <p>
                Area and line length are calculated by the backend in projected
                coordinates. Features with unknown CRS or invalid geometry
                receive explicit errors.
              </p>
            </div>
          </div>
          <div className="guidance-note">
            <Info size={20} />
            <div>
              <strong>Processing outcomes</strong>
              <p>
                Files may complete fully or partially. Individual feature errors
                remain visible in the measurement workspace.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
