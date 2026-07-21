import { Icon } from "@/components/icons";

export default function Loading() {
  return (
    <main className="app-loading" aria-busy="true" aria-live="polite">
      <div className="loading-brand">
        <span className="brand-mark"><Icon name="sparkles" size={18} /></span>
        AUTO—TINKER
      </div>
      <div className="loading-shell">
        <div className="skeleton skeleton-title" />
        <div className="skeleton-row">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-graph" />
      </div>
      <span className="loading-label">Opening your local workspace…</span>
    </main>
  );
}
