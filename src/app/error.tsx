"use client";

import { Icon } from "@/components/icons";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="fatal-state">
      <span className="fatal-icon"><Icon name="x" size={30} /></span>
      <span className="eyebrow">Viewer error</span>
      <h1>The workspace view hit a snag.</h1>
      <p>Your Markdown records were not changed. Retry the viewer, or copy a diagnosis prompt from the dashboard after it reloads.</p>
      <button className="primary-button" onClick={reset} type="button"><Icon name="refresh" size={16} /> Retry viewer</button>
    </main>
  );
}
