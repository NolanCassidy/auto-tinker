"use client";

import { useMemo, useState } from "react";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { Icon } from "@/components/icons";
import type {
  QueueItem,
  QueueStatus,
  ViewerMutation,
} from "@/components/viewer-types";

const statusOptions: { value: QueueStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "queued", label: "Queued" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

export function QueueBoard({
  items,
  updatingIds,
  onPatch,
}: {
  items: QueueItem[];
  updatingIds: Set<string>;
  onPatch: (id: string, patch: ViewerMutation) => Promise<void>;
}) {
  const [scope, setScope] = useState<"all" | "starred" | "scheduled">("all");
  const visibleItems = useMemo(() => {
    const scoped = items.filter((item) => {
      if (scope === "starred") return item.starred;
      if (scope === "scheduled") return Boolean(item.scheduledAt);
      return true;
    });
    return [...scoped].sort((a, b) => a.rank - b.rank);
  }, [items, scope]);

  if (items.length === 0) {
    return (
      <div className="empty-state queue-empty">
        <span className="empty-state-icon"><Icon name="layers" size={26} /></span>
        <h3>No ideas in the queue yet</h3>
        <p>Ask Auto-Tinker to discover work from your interests, history, or a topic.</p>
        <CopyPromptButton action="discover" label="Copy discovery prompt" />
      </div>
    );
  }

  return (
    <div className="queue-board">
      <div className="segmented-control" aria-label="Filter queue">
        {(["all", "starred", "scheduled"] as const).map((value) => (
          <button
            aria-pressed={scope === value}
            className={scope === value ? "is-active" : ""}
            key={value}
            onClick={() => setScope(value)}
            type="button"
          >
            {value === "all" ? "All" : value === "starred" ? "Starred" : "Scheduled"}
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="inline-empty">No {scope} queue items.</div>
      ) : (
        <ol className="queue-list">
          {visibleItems.map((item, index) => {
            const isUpdating = updatingIds.has(item.id);
            const scheduledDate = item.scheduledAt?.slice(0, 10) ?? "";
            return (
              <li className={`queue-item ${isUpdating ? "is-updating" : ""}`} key={item.id}>
                <div className="queue-rank" aria-label={`Rank ${item.rank}`}>
                  <button
                    disabled={index === 0 || isUpdating}
                    onClick={() => onPatch(item.id, { rank: Math.max(1, item.rank - 1) })}
                    title="Move up"
                    type="button"
                  >
                    <Icon name="chevron-down" size={15} className="rotate-180" />
                    <span className="sr-only">Move {item.title} up</span>
                  </button>
                  <strong>{String(item.rank).padStart(2, "0")}</strong>
                  <button
                    disabled={index === visibleItems.length - 1 || isUpdating}
                    onClick={() => onPatch(item.id, { rank: item.rank + 1 })}
                    title="Move down"
                    type="button"
                  >
                    <Icon name="chevron-down" size={15} />
                    <span className="sr-only">Move {item.title} down</span>
                  </button>
                </div>

                <div className="queue-item-main">
                  <div className="queue-item-heading">
                    <button
                      aria-label={item.starred ? `Unstar ${item.title}` : `Star ${item.title}`}
                      aria-pressed={item.starred}
                      className={`star-button ${item.starred ? "is-starred" : ""}`}
                      disabled={isUpdating}
                      onClick={() => onPatch(item.id, { starred: !item.starred })}
                      type="button"
                    >
                      <Icon name="star" size={17} />
                    </button>
                    <div>
                      <div className="queue-title-row">
                        <h3>{item.title}</h3>
                        {typeof item.score === "number" && (
                          <span className="score-badge">{Math.round(item.score)} match</span>
                        )}
                      </div>
                      <p>{item.summary}</p>
                    </div>
                  </div>

                  <div className="tag-list" aria-label="Tags">
                    {item.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
                    {item.effort && <span className="effort-tag"><Icon name="clock" size={12} /> {item.effort}</span>}
                  </div>

                  {(typeof item.goalAlignment === "number" || item.distractionRisk) && (
                    <div className="goal-signal-row">
                      {typeof item.goalAlignment === "number" && (
                        <span className="goal-alignment">
                          <Icon name="target" size={13} /> {Math.round(item.goalAlignment)}% goal alignment
                        </span>
                      )}
                      {item.distractionRisk && (
                        <span className={`distraction-risk risk-${item.distractionRisk}`}>
                          {item.distractionRisk === "high" ? "Possible distraction" : `${item.distractionRisk} distraction risk`}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="queue-controls">
                    <label>
                      <span>Status</span>
                      <select
                        disabled={isUpdating}
                        onChange={(event) => onPatch(item.id, { status: event.target.value as QueueStatus })}
                        value={item.status}
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Schedule</span>
                      <input
                        disabled={isUpdating}
                        onChange={(event) => onPatch(item.id, { scheduledAt: event.target.value || null })}
                        type="date"
                        value={scheduledDate}
                      />
                    </label>
                    <button
                      aria-pressed={item.reviewed}
                      className={`review-toggle ${item.reviewed ? "is-reviewed" : ""}`}
                      disabled={isUpdating}
                      onClick={() => onPatch(item.id, { reviewed: !item.reviewed })}
                      type="button"
                    >
                      <Icon name={item.reviewed ? "check" : "eye"} size={15} />
                      {item.reviewed ? "Reviewed" : "Mark reviewed"}
                    </button>
                    <CopyPromptButton
                      action="start"
                      compact
                      label="Copy start prompt"
                      recordId={item.id}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
