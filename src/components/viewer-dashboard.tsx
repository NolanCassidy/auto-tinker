"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { Icon, type IconName } from "@/components/icons";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { QueueBoard } from "@/components/queue-board";
import type {
  Experiment,
  PublicationItem,
  ViewerMutation,
  ViewerSnapshot,
  WritingSurface,
} from "@/components/viewer-types";

const navigation: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "graph", label: "Knowledge graph", icon: "graph" },
  { id: "queue", label: "Idea queue", icon: "layers" },
  { id: "experiments", label: "Experiments", icon: "code" },
  { id: "learning", label: "Learning log", icon: "book" },
  { id: "publication", label: "Publication", icon: "globe" },
  { id: "sources", label: "Sources & settings", icon: "settings" },
];

const surfaceIcons: Record<WritingSurface["kind"], IconName> = {
  journal: "book",
  readme: "clipboard",
  changelog: "history",
  story: "sparkles",
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDate(value?: string) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(date);
}

function sentenceCase(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

async function requestViewerSnapshot() {
  const response = await fetch("/api/viewer", { cache: "no-store" });
  const payload = (await response.json()) as ViewerSnapshot & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The workspace could not be read.");
  return payload;
}

function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${value}`}>{sentenceCase(value)}</span>;
}

function PrivacyPill({ value }: { value: "private" | "review" | "public" }) {
  return (
    <span className={`privacy-pill privacy-${value}`}>
      <Icon name={value === "public" ? "globe" : value === "review" ? "eye" : "lock"} size={12} />
      {sentenceCase(value)}
    </span>
  );
}

function LocationBadge({ experiment }: { experiment: Experiment }) {
  const icon: IconName =
    experiment.location.kind === "github"
      ? "github"
      : experiment.location.kind === "local"
        ? "terminal"
        : experiment.location.kind === "knowledge-only"
          ? "lightbulb"
          : "external";
  return (
    <span
      className={`location-badge location-${experiment.location.status}`}
      title="Code location is optional and specific to this device"
    >
      <Icon name={icon} size={13} />
      {sentenceCase(experiment.location.kind)}
      <span className="location-separator">·</span>
      {sentenceCase(experiment.location.status)}
    </span>
  );
}

function WritingSurfaces({ experiment }: { experiment: Experiment }) {
  const surfaceByKind = new Map(experiment.writing.map((surface) => [surface.kind, surface]));
  const surfaces: WritingSurface[] = (["journal", "readme", "changelog", "story"] as const).map(
    (kind) =>
      surfaceByKind.get(kind) ?? {
        kind,
        title:
          kind === "journal"
            ? "Private journal"
            : kind === "readme"
              ? "Rich README"
              : kind === "changelog"
                ? "Dated changelog"
                : "Public story",
        state: "missing",
        privacy: kind === "story" ? "review" : "private",
      },
  );
  const authoredPreview = surfaces.find(
    (surface) => (surface.kind === "story" || surface.kind === "readme") && surface.preview,
  );

  return (
    <>
      <div className="writing-surfaces" aria-label="Writing surfaces">
        {surfaces.map((surface) => (
          <div className={`writing-surface surface-${surface.state}`} key={surface.kind}>
            <span className="writing-icon"><Icon name={surfaceIcons[surface.kind]} size={14} /></span>
            <span>
              <strong>{surface.title}</strong>
              <small>{sentenceCase(surface.state)} · {surface.privacy}</small>
            </span>
          </div>
        ))}
      </div>
      {authoredPreview?.preview && (
        <blockquote className="authored-preview">
          <span><Icon name="sparkles" size={13} /> First-person {authoredPreview.kind === "story" ? "story" : "README"} draft</span>
          <p>“{authoredPreview.preview}”</p>
        </blockquote>
      )}
    </>
  );
}

function ReadinessRing({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      aria-label={`${safeValue}% ready`}
      className="readiness-ring"
      style={{ "--readiness": `${safeValue * 3.6}deg` } as React.CSSProperties}
    >
      <strong>{safeValue}</strong>
      <small>%</small>
    </span>
  );
}

function LoadingDashboard() {
  return (
    <div className="app-loading" aria-live="polite" aria-busy="true">
      <div className="loading-brand"><span className="brand-mark"><Icon name="sparkles" size={18} /></span> AUTO—TINKER</div>
      <div className="loading-shell">
        <div className="skeleton skeleton-title" />
        <div className="skeleton-row">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-graph" />
      </div>
      <span className="loading-label">Reading your local workspace…</span>
    </div>
  );
}

export function ViewerDashboard() {
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [autoPublicConfirm, setAutoPublicConfirm] = useState(false);
  const [settingUpdating, setSettingUpdating] = useState(false);

  const loadSnapshot = useCallback(async () => {
    try {
      const payload = await requestViewerSnapshot();
      setError(null);
      setSnapshot(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The workspace could not be read.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void requestViewerSnapshot()
      .then((payload) => {
        if (!active) return;
        setError(null);
        setSnapshot(payload);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "The workspace could not be read.");
      });
    return () => {
      active = false;
    };
  }, []);

  const patchRecord = useCallback(
    async (id: string, patch: ViewerMutation) => {
      if (!snapshot) return;
      const previous = snapshot;
      setUpdatingIds((current) => new Set(current).add(id));
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          queue: current.queue.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...patch,
                  scheduledAt:
                    patch.scheduledAt === undefined ? item.scheduledAt : patch.scheduledAt,
                }
              : item,
          ),
          publication: current.publication.map((item) =>
            item.id === id && patch.publicStoryReview
              ? { ...item, storyReview: patch.publicStoryReview }
              : item,
          ),
        };
      });

      try {
        const response = await fetch(`/api/records/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const payload = (await response.json()) as { error?: string; warning?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Change could not be saved.");
        }
        if (payload.warning) setError(payload.warning);
      } catch (mutationError) {
        setSnapshot(previous);
        setError(mutationError instanceof Error ? mutationError.message : "Change could not be saved.");
      } finally {
        setUpdatingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [snapshot],
  );

  const updateAutoPublic = useCallback(
    async (autoPublic: boolean) => {
      if (!snapshot) return;
      const previous = snapshot;
      setSettingUpdating(true);
      setSnapshot({ ...snapshot, settings: { ...snapshot.settings, autoPublic } });
      try {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ autoPublic }),
        });
        const payload = (await response.json()) as { error?: string; warning?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Setting could not be saved.");
        }
        if (payload.warning) setError(payload.warning);
        setAutoPublicConfirm(false);
      } catch (settingError) {
        setSnapshot(previous);
        setError(settingError instanceof Error ? settingError.message : "Setting could not be saved.");
      } finally {
        setSettingUpdating(false);
      }
    },
    [snapshot],
  );

  const topQueueItem = useMemo(
    () => snapshot?.queue.slice().sort((a, b) => a.rank - b.rank)[0],
    [snapshot],
  );

  if (!snapshot && !error) return <LoadingDashboard />;

  if (!snapshot && error) {
    return (
      <main className="fatal-state">
        <span className="fatal-icon"><Icon name="database" size={32} /></span>
        <span className="eyebrow">Local workspace unavailable</span>
        <h1>Auto-Tinker could not read the vault.</h1>
        <p>{error}</p>
        <div className="fatal-actions">
          <button className="primary-button" onClick={() => void loadSnapshot()} type="button">
            <Icon name="refresh" size={16} /> Try again
          </button>
          <CopyPromptButton action="diagnose" label="Copy diagnosis prompt" />
        </div>
      </main>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar ${mobileMenuOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <button
            className="brand"
            onClick={() => scrollToSection("overview")}
            type="button"
          >
            <span className="brand-mark"><Icon name="sparkles" size={17} /></span>
            <span><strong>AUTO—TINKER</strong><small>local learning system</small></span>
          </button>
          <button className="mobile-close" onClick={() => setMobileMenuOpen(false)} type="button">
            <Icon name="x" size={20} /><span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace sections">
          <span className="nav-label">Workspace</span>
          {navigation.map((item, index) => (
            <button
              className={index === 0 ? "is-active" : ""}
              key={item.id}
              onClick={() => {
                scrollToSection(item.id);
                setMobileMenuOpen(false);
              }}
              type="button"
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.id === "queue" && snapshot.summary.queued > 0 && <em>{snapshot.summary.queued}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-plan">
          <span className="plan-orbit" />
          <div>
            <span className="eyebrow">Daily pace</span>
            <strong>{snapshot.settings.dailyExperimentCount} experiment{snapshot.settings.dailyExperimentCount === 1 ? "" : "s"}</strong>
            <small>{snapshot.settings.maxConcurrent} max at once</small>
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="local-status"><i /> Local-first</span>
          <span>{snapshot.workspaceName}</span>
        </div>
      </aside>

      {mobileMenuOpen && <button aria-label="Close menu" className="sidebar-scrim" onClick={() => setMobileMenuOpen(false)} type="button" />}

      <main
        aria-hidden={mobileMenuOpen || undefined}
        className="main-content"
        id="main-content"
        inert={mobileMenuOpen || undefined}
      >
        <header className="topbar">
          {!mobileMenuOpen && (
            <button className="mobile-menu" onClick={() => setMobileMenuOpen(true)} type="button">
              <Icon name="menu" size={20} /><span className="sr-only">Open menu</span>
            </button>
          )}
          <div className="breadcrumbs">
            <span>{snapshot.workspaceName}</span><Icon name="chevron-right" size={14} /><strong>Overview</strong>
          </div>
          <div className="topbar-actions">
            <span className="sync-state"><i /> Saved locally</span>
            <CopyPromptButton action="daily-review" compact label="Copy daily review" />
          </div>
        </header>

        <div className="content-wrap">
          {error && (
            <div className="notice notice-error" role="alert">
              <Icon name="x" size={16} /><span>{error}</span>
              <button onClick={() => setError(null)} type="button">Dismiss</button>
            </div>
          )}

          {!snapshot.initialized && (
            <div className="notice notice-setup">
              <Icon name="database" size={17} />
              <div><strong>This workspace has not been initialized.</strong><span>Copy the setup prompt, then run it in Codex, ChatGPT, or your preferred coding agent.</span></div>
              <CopyPromptButton action="setup" compact label="Copy setup prompt" />
            </div>
          )}

          {snapshot.warnings.map((warning) => (
            <div className="notice notice-warning" key={warning}><Icon name="lightbulb" size={16} />{warning}</div>
          ))}

          <section className="hero" id="overview">
            <div className="hero-copy">
              <span className="eyebrow"><Icon name="sparkles" size={14} /> Your learning workspace</span>
              <h1>{snapshot.greeting}</h1>
              <p>{snapshot.focus || "Turn curiosity into small, verified experiments—and keep the evidence."}</p>
              <div className="hero-actions">
                <CopyPromptButton action="next" label="Copy next experiment prompt" />
                <CopyPromptButton action="discover" label="Find something new" />
              </div>
              <small className="prompt-reassurance"><Icon name="copy" size={12} /> Copies instructions only. No agent runs from this app.</small>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <div className="hero-core"><Icon name="sparkles" size={30} /></div>
              <span className="orbit-label label-build">BUILD</span>
              <span className="orbit-label label-learn">LEARN</span>
              <span className="orbit-label label-share">SHARE</span>
            </div>
          </section>

          <section className="metric-grid" aria-label="Workspace summary">
            <article className="metric-card accent-violet">
              <span className="metric-icon"><Icon name="layers" size={18} /></span>
              <div><strong>{snapshot.summary.queued}</strong><span>Ideas queued</span></div>
              <small>{snapshot.queue.filter((item) => item.starred).length} starred</small>
            </article>
            <article className="metric-card accent-cyan">
              <span className="metric-icon"><Icon name="code" size={18} /></span>
              <div><strong>{snapshot.summary.active}</strong><span>Active tinkers</span></div>
              <small>{snapshot.settings.maxConcurrent} allowed</small>
            </article>
            <article className="metric-card accent-green">
              <span className="metric-icon"><Icon name="check" size={18} /></span>
              <div><strong>{snapshot.summary.completed}</strong><span>Completed</span></div>
              <small>{snapshot.streakDays} day streak</small>
            </article>
            <article className="metric-card accent-pink">
              <span className="metric-icon"><Icon name="book" size={18} /></span>
              <div><strong>{snapshot.summary.lessons}</strong><span>Lessons captured</span></div>
              <small>{snapshot.summary.graphNodes} graph nodes</small>
            </article>
          </section>

          <section className="main-goal-surface" aria-labelledby="main-goal-title">
            <div className="goal-accent" aria-hidden="true"><Icon name="target" size={25} /></div>
            {snapshot.mainGoal ? (
              <>
                <div className="main-goal-copy">
                  <span className="eyebrow">Main goal · {snapshot.mainGoal.horizon}</span>
                  <h2 id="main-goal-title">{snapshot.mainGoal.title}</h2>
                  <p>{snapshot.mainGoal.outcome}</p>
                  {snapshot.mainGoal.supportingGoals.length > 0 && (
                    <div className="supporting-goals" aria-label="Supporting goals">
                      {snapshot.mainGoal.supportingGoals.map((goal) => <span key={goal}>{goal}</span>)}
                    </div>
                  )}
                </div>
                <div className="goal-proof">
                  <div className="goal-progress-heading"><span>Evidence-backed progress</span><strong>{Math.round(snapshot.mainGoal.progress)}%</strong></div>
                  <div className="goal-progress"><i style={{ width: `${Math.max(0, Math.min(100, snapshot.mainGoal.progress))}%` }} /></div>
                  <div className="goal-columns">
                    <div><span>Success looks like</span><ul>{snapshot.mainGoal.successCriteria.slice(0, 3).map((criterion) => <li key={criterion}><Icon name="target" size={12} />{criterion}</li>)}</ul></div>
                    <div><span>Evidence so far</span>{snapshot.mainGoal.evidence.length ? <ul>{snapshot.mainGoal.evidence.slice(0, 3).map((item) => <li key={item}><Icon name="check" size={12} />{item}</li>)}</ul> : <p>No evidence linked yet.</p>}</div>
                  </div>
                </div>
                <div className="goal-actions"><CopyPromptButton action="goal-change" compact label="Refine goal" recordId={snapshot.mainGoal.id} /><CopyPromptButton action="goal-switch" compact label="Switch goal" /></div>
              </>
            ) : (
              <>
                <div className="main-goal-copy"><span className="eyebrow">Main goal</span><h2 id="main-goal-title">Give the queue a north star.</h2><p>Define one outcome so discovery can distinguish leverage from interesting distraction.</p></div>
                <CopyPromptButton action="goal-change" label="Define main goal in chat" />
              </>
            )}
          </section>

          <section className="section-block" id="graph">
            <div className="section-heading">
              <div><span className="eyebrow">Connected context</span><h2>Knowledge graph</h2><p>Ideas stay visible even when their code lives elsewhere—or nowhere yet.</p></div>
              <CopyPromptButton action="graph-review" compact label="Ask about this graph" />
            </div>
            <div className="graph-layout">
              <div className="panel graph-panel"><KnowledgeGraph nodes={snapshot.graph.nodes} edges={snapshot.graph.edges} /></div>
              <aside className="panel next-panel">
                <div className="panel-kicker"><span><Icon name="target" size={15} /> Next up</span><small>Rank 01</small></div>
                {topQueueItem ? (
                  <>
                    <div className="next-illustration"><Icon name="code" size={26} /><span /></div>
                    <StatusPill value={topQueueItem.status} />
                    <h3>{topQueueItem.title}</h3>
                    <p>{topQueueItem.reason || topQueueItem.summary}</p>
                    <div className="tag-list">{topQueueItem.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                    <CopyPromptButton action="start" recordId={topQueueItem.id} label="Copy start prompt" />
                    <button className="text-button" onClick={() => scrollToSection("queue")} type="button">Review full queue <Icon name="chevron-right" size={14} /></button>
                  </>
                ) : (
                  <div className="mini-empty"><Icon name="sparkles" size={24} /><h3>Ready for a new direction</h3><p>Discover an idea that matches your profile and machine.</p><CopyPromptButton action="discover" compact label="Copy discovery prompt" /></div>
                )}
              </aside>
            </div>
          </section>

          <section className="section-block" id="queue">
            <div className="section-heading">
              <div><span className="eyebrow">Human-directed</span><h2>Idea queue</h2><p>Star, rank, schedule, and review. Your ordering always wins.</p></div>
              <CopyPromptButton action="queue-plan" compact label="Ask AI to propose an order" />
            </div>
            <div className="panel queue-panel">
              <QueueBoard items={snapshot.queue} onPatch={patchRecord} updatingIds={updatingIds} />
            </div>
          </section>

          <section className="section-block" id="experiments">
            <div className="section-heading">
              <div><span className="eyebrow">Proof over claims</span><h2>Experiments</h2><p>Code is optional; verified learning and a durable record are not.</p></div>
              <CopyPromptButton action="experiment-review" compact label="Review experiments in chat" />
            </div>
            {snapshot.experiments.length === 0 ? (
              <div className="panel empty-state"><span className="empty-state-icon"><Icon name="code" size={26} /></span><h3>No experiments recorded</h3><p>Start the top queue item, or backfill experiments from your work history.</p><div className="empty-actions"><CopyPromptButton action="next" label="Copy start prompt" /><CopyPromptButton action="backfill" label="Backfill history" /></div></div>
            ) : (
              <div className="experiment-grid">
                {snapshot.experiments.map((experiment) => (
                  <article className="panel experiment-card" key={experiment.id}>
                    <div className="experiment-topline">
                      <span className="experiment-symbol"><Icon name={experiment.status === "done" ? "check" : "code"} size={18} /></span>
                      <div className="experiment-badges"><PrivacyPill value={experiment.privacy} /><StatusPill value={experiment.status} /></div>
                    </div>
                    <h3>{experiment.title}</h3>
                    <p>{experiment.summary}</p>
                    <div className="experiment-meta">
                      <LocationBadge experiment={experiment} />
                      {experiment.language && <span><Icon name="code" size={13} /> {experiment.language}</span>}
                      <span><Icon name="clock" size={13} /> {formatDate(experiment.updatedAt)}</span>
                    </div>
                    <div className="progress-row"><span>Experiment progress</span><strong>{experiment.progress}%</strong></div>
                    <div className="progress-track"><i style={{ width: `${experiment.progress}%` }} /></div>
                    <WritingSurfaces experiment={experiment} />
                    <div className="experiment-actions">
                      <CopyPromptButton action="continue" compact label="Copy continue prompt" recordId={experiment.id} />
                      <CopyPromptButton action="write" compact label="Improve the write-up" recordId={experiment.id} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section-block" id="learning">
            <div className="section-heading">
              <div><span className="eyebrow">Memory that compounds</span><h2>Learning & journal</h2><p>Private evidence, dated decisions, and capabilities extracted from real work.</p></div>
              <CopyPromptButton action="lesson" compact label="Capture a lesson" />
            </div>
            <div className="learning-layout">
              <div className="panel timeline-panel">
                <div className="panel-kicker"><span><Icon name="history" size={15} /> Recent activity</span><small>{snapshot.timeline.length} entries</small></div>
                {snapshot.timeline.length === 0 ? (
                  <div className="mini-empty"><Icon name="history" size={24} /><h3>No history captured yet</h3><p>Your journal and changelog will appear here.</p><CopyPromptButton action="backfill" compact label="Copy backfill prompt" /></div>
                ) : (
                  <ol className="timeline-list">
                    {snapshot.timeline.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <span className={`timeline-dot timeline-${item.type}`}><Icon name={item.type === "lesson" ? "lightbulb" : item.type === "changelog" ? "history" : "book"} size={13} /></span>
                        <div><span className="timeline-meta">{sentenceCase(item.type)} · {formatDate(item.occurredAt)}</span><h3>{item.title}</h3><p>{item.summary}</p>{item.tags.length > 0 && <div className="tag-list">{item.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <aside className="panel interests-panel">
                <div className="panel-kicker"><span><Icon name="trend" size={15} /> Interest signal</span><small>learned + explicit</small></div>
                {snapshot.interests.length === 0 ? (
                  <div className="mini-empty"><Icon name="target" size={24} /><h3>Teach it what matters</h3><p>Add topics, goals, dislikes, and constraints.</p><CopyPromptButton action="profile" compact label="Copy profile prompt" /></div>
                ) : (
                  <div className="interest-list">
                    {snapshot.interests.slice(0, 8).map((interest) => (
                      <div className="interest-row" key={interest.name}>
                        <div><strong>{interest.name}</strong><span>{interest.evidence} signal{interest.evidence === 1 ? "" : "s"}</span></div>
                        <div className="interest-track"><i style={{ width: `${Math.max(5, Math.min(100, interest.weight))}%` }} /></div>
                        <b>{Math.round(interest.weight)}</b>
                      </div>
                    ))}
                  </div>
                )}
                <CopyPromptButton action="profile" compact label="Tune interests in chat" />
              </aside>
            </div>
          </section>

          <section className="section-block" id="publication">
            <div className="section-heading">
              <div><span className="eyebrow">Private by default</span><h2>Publication readiness</h2><p>Review the evidence and story before anything becomes public.</p></div>
              <div className="private-default"><Icon name="lock" size={14} /> New repos default private</div>
            </div>
            {snapshot.publication.length === 0 ? (
              <div className="panel empty-state publication-empty"><span className="empty-state-icon"><Icon name="globe" size={26} /></span><h3>Nothing is waiting to publish</h3><p>Completed experiments will appear here for review. Publication is always a separate action.</p></div>
            ) : (
              <div className="publication-list">
                {snapshot.publication.map((item: PublicationItem) => (
                  <article className="panel publication-card" key={item.id}>
                    <ReadinessRing value={item.readiness} />
                    <div className="publication-main">
                      <div className="publication-title"><h3>{item.title}</h3><PrivacyPill value={item.privacy} /></div>
                      <div className="check-list">
                        <span className={item.testsPassing ? "is-ready" : ""}><Icon name={item.testsPassing ? "check" : "minus"} size={13} /> Tests verified</span>
                        <span className={item.readmeReady ? "is-ready" : ""}><Icon name={item.readmeReady ? "check" : "minus"} size={13} /> README tells the story</span>
                        <span className={item.attributionReady ? "is-ready" : ""}><Icon name={item.attributionReady ? "check" : "minus"} size={13} /> Attribution ready</span>
                        <span className={item.reviewed ? "is-ready" : ""}><Icon name={item.reviewed ? "check" : "minus"} size={13} /> Human reviewed</span>
                      </div>
                      {item.blockers.length > 0 && <p className="blocker-copy">Still needed: {item.blockers.join(" · ")}</p>}
                    </div>
                    <div className="publication-actions">
                      <CopyPromptButton action="publish-review" compact label="Review in chat" recordId={item.id} />
                      <button
                        aria-pressed={item.storyReview === "approved"}
                        className={`review-toggle ${item.storyReview === "approved" ? "is-reviewed" : ""}`}
                        disabled={updatingIds.has(item.id)}
                        onClick={() => void patchRecord(item.id, { publicStoryReview: item.storyReview === "approved" ? "pending" : "approved" })}
                        type="button"
                      >
                        <Icon name={item.storyReview === "approved" ? "check" : "eye"} size={14} />
                        {item.storyReview === "approved" ? "Story draft reviewed" : "Mark story draft reviewed"}
                      </button>
                      {item.storyReview === "approved" && <CopyPromptButton action="publish" compact label="Copy repository publication prompt" recordId={item.id} />}
                      <small className="approval-note"><Icon name="lock" size={11} /> This only records review of the public-story draft. It cannot approve or publish a GitHub repository.</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section-block" id="sources">
            <div className="section-heading">
              <div><span className="eyebrow">Configurable inputs</span><h2>Sources & settings</h2><p>Your local profile shapes discovery; source changes happen through chat.</p></div>
              <CopyPromptButton action="settings" compact label="Change settings in chat" />
            </div>
            <div className="source-settings-grid">
              <div className="panel sources-panel">
                <div className="panel-kicker"><span><Icon name="globe" size={15} /> Discovery sources</span><small>{snapshot.sources.filter((source) => source.enabled).length} enabled</small></div>
                {snapshot.sources.length === 0 ? (
                  <div className="mini-empty"><Icon name="search" size={24} /><h3>No sources configured</h3><p>Add GitHub Trending, release feeds, newsletters, or any domain you trust.</p></div>
                ) : (
                  <ul className="source-list">
                    {snapshot.sources.map((source) => (
                      <li key={source.id}><span className={`source-icon source-${source.kind}`}><Icon name={source.kind.toLowerCase().includes("github") ? "github" : source.kind.toLowerCase().includes("local") ? "terminal" : "globe"} size={16} /></span><div><strong>{source.title}</strong><small>{source.detail || sentenceCase(source.kind)}{source.weight !== undefined ? ` · weight ${source.weight}` : ""}{source.techniques?.length ? ` · ${source.techniques.length} technique${source.techniques.length === 1 ? "" : "s"}` : ""}{source.lastChecked ? ` · checked ${formatDate(source.lastChecked)}` : ""}</small></div><span className={`source-state ${source.enabled ? "is-enabled" : ""}`}><i /> {source.enabled ? "On" : "Off"}</span></li>
                    ))}
                  </ul>
                )}
                <CopyPromptButton action="sources" compact label="Add or tune sources" />
              </div>
              <aside className="panel settings-panel">
                <div className="panel-kicker"><span><Icon name="settings" size={15} /> Working policy</span><small>Markdown source of truth</small></div>
                <dl className="settings-list">
                  <div><dt>Daily target</dt><dd>{snapshot.settings.dailyExperimentCount} experiment{snapshot.settings.dailyExperimentCount === 1 ? "" : "s"}</dd></div>
                  <div><dt>Concurrent limit</dt><dd>{snapshot.settings.maxConcurrent}</dd></div>
                  <div><dt>Preferred agent</dt><dd>{snapshot.settings.preferredAgent}</dd></div>
                  <div><dt>Automation mode</dt><dd>{sentenceCase(snapshot.settings.automationMode)}</dd></div>
                  <div><dt>Time budget</dt><dd>{snapshot.settings.timeBudgetMinutes} minutes</dd></div>
                  <div className="setting-with-control"><dt>Future repo policy</dt><dd><button
                    aria-label="Durable auto-public"
                    aria-checked={snapshot.settings.autoPublic}
                    className={`policy-switch ${snapshot.settings.autoPublic ? "is-on" : ""}`}
                    disabled={settingUpdating}
                    onClick={() => snapshot.settings.autoPublic ? void updateAutoPublic(false) : setAutoPublicConfirm(true)}
                    role="switch"
                    type="button"
                  ><span /><Icon name={snapshot.settings.autoPublic ? "globe" : "lock"} size={13} /> {snapshot.settings.autoPublic ? "Durable auto-public enabled" : "Private by default"}</button></dd></div>
                  <div><dt>Preferred languages</dt><dd>{snapshot.settings.preferredLanguages.length ? snapshot.settings.preferredLanguages.join(", ") : "Any"}</dd></div>
                  <div><dt>GitHub</dt><dd><i className={snapshot.settings.githubConnected ? "status-on" : "status-off"} /> {snapshot.settings.githubConnected ? "Available" : "Not verified"}</dd></div>
                  <div><dt>Storage</dt><dd><Icon name="database" size={13} /> {snapshot.settings.localOnly ? "Local only" : "Sync configured"}</dd></div>
                </dl>
                {autoPublicConfirm && (
                  <div className="policy-warning" role="alert">
                    <Icon name="globe" size={17} />
                    <div><strong>Enable durable auto-public?</strong><p>The chat-invoked publish skill may make a verified repository public without a per-repository visibility approval. Public-story review is separate and never grants GitHub permission. Existing repositories stay unchanged, and this viewer never calls GitHub.</p><div><button className="danger-outline-button" disabled={settingUpdating} onClick={() => void updateAutoPublic(true)} type="button">Enable durable auto-public</button><button className="text-button" onClick={() => setAutoPublicConfirm(false)} type="button">Keep private</button></div></div>
                  </div>
                )}
                <div className="workspace-path"><span>Vault</span><code>{snapshot.settings.vaultLabel}</code></div>
                <div className="writing-voice-card">
                  <span><Icon name="sparkles" size={14} /> Writing voice</span>
                  <blockquote>“{snapshot.settings.writingVoice || "No writing voice has been captured yet. Keep public notes direct, specific, and recognizably yours."}”</blockquote>
                  <CopyPromptButton action="writing-voice" compact label="Refine voice in chat" />
                </div>
                <div className="safety-note"><Icon name="lock" size={14} /><span>The viewer stores no credentials and never runs code, skills, or agents.</span></div>
              </aside>
            </div>
          </section>

          <footer className="app-footer">
            <div><span className="brand-mark small"><Icon name="sparkles" size={13} /></span><strong>Auto—Tinker</strong><span>Make curiosity compound.</span></div>
            <span>Snapshot {formatDate(snapshot.generatedAt)} · local Markdown remains the source of truth.</span>
          </footer>
        </div>
      </main>

      {!mobileMenuOpen && (
        <nav className="mobile-bottom-nav" aria-label="Mobile workspace navigation">
          {navigation.slice(0, 5).map((item) => (
            <button key={item.id} onClick={() => scrollToSection(item.id)} type="button"><Icon name={item.icon} size={18} /><span>{item.label.split(" ")[0]}</span></button>
          ))}
        </nav>
      )}
    </div>
  );
}
