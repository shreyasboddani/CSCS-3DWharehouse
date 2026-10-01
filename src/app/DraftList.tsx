import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./service";
import type { DesignDraft } from "../domain/drafts";
import { FloorPlan } from "./FloorPlan";
export function DraftList() {
  const [drafts, setDrafts] = useState<DesignDraft[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ drafts: DesignDraft[] }>("/drafts")
      .then((r) => {
        if (active) setDrafts(r.drafts);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Request failed");
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return <p className="error">Design drafts could not be loaded: {error}</p>;
  if (!drafts.length) return null;
  return (
    <section className="design-draft-list">
      <div className="list-heading">
        <div>
          <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
          <h2>
            Design drafts <span>{drafts.length}</span>
          </h2>
          <p className="subtle">
            Saved work in progress. Drafts do not affect operational warehouses.
          </p>
        </div>
      </div>
      <div className="warehouse-grid">
        {drafts.map((d) => (
          <Link
            key={d.id}
            className="warehouse-card"
            to={
              (d.warehouseId
                ? `/app/warehouses/${d.warehouseId}/edit`
                : "/app/new") +
              "?draft=" +
              d.id
            }
          >
            <div className="warehouse-thumb">
              <FloorPlan config={d.config} />
              <span className="pill">DESIGN DRAFT</span>
            </div>
            <div className="warehouse-card-copy">
              <h3>{d.config.name || "Untitled warehouse"}</h3>
              <p>{d.config.site || "Site not specified"}</p>
              <div className="card-meta">
                <span>{d.config.design?.floors.length || 1} floors</span>
                <span>Saved {new Date(d.updatedAt).toLocaleString()}</span>
                <span>Resume design →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
