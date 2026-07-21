export type RecordPrivacy = "private" | "review" | "public";

export type QueueStatus =
  | "idea"
  | "queued"
  | "ready"
  | "in_progress"
  | "blocked"
  | "done"
  | "archived";

export type GraphNode = {
  id: string;
  title: string;
  type: string;
  status: string;
  privacy: RecordPrivacy;
  tags: string[];
  summary?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  kind?: string;
};

export type QueueItem = {
  id: string;
  title: string;
  summary: string;
  status: QueueStatus;
  rank: number;
  starred: boolean;
  reviewed: boolean;
  scheduledAt: string | null;
  privacy: RecordPrivacy;
  tags: string[];
  score?: number;
  effort?: string;
  source?: string;
  reason?: string;
  goalAlignment?: number;
  distractionRisk?: "low" | "medium" | "high";
};

export type MainGoal = {
  id?: string;
  title: string;
  outcome: string;
  horizon: string;
  progress: number;
  successCriteria: string[];
  evidence: string[];
  supportingGoals: string[];
};

export type Experiment = {
  id: string;
  title: string;
  summary: string;
  status: string;
  privacy: RecordPrivacy;
  progress: number;
  repo?: string;
  location: {
    kind: "local" | "github" | "other" | "knowledge-only";
    status: "present" | "missing" | "unverified";
    label?: string;
  };
  language?: string;
  updatedAt: string;
  tags: string[];
  testsPassing: boolean;
  reviewed: boolean;
  readmeReady: boolean;
  attributionReady: boolean;
  writing: WritingSurface[];
};

export type WritingSurface = {
  kind: "journal" | "readme" | "changelog" | "story";
  title: string;
  state: "missing" | "draft" | "ready" | "published";
  privacy: RecordPrivacy;
  updatedAt?: string;
  preview?: string;
};

export type TimelineItem = {
  id: string;
  type: "lesson" | "journal" | "changelog" | "event";
  title: string;
  summary: string;
  occurredAt: string;
  tags: string[];
  experimentId?: string;
};

export type SourceItem = {
  id: string;
  title: string;
  kind: string;
  enabled: boolean;
  lastChecked?: string;
  detail?: string;
  weight?: number;
  techniques?: string[];
};

export type InterestItem = {
  name: string;
  weight: number;
  evidence: number;
};

export type ViewerSettings = {
  dailyExperimentCount: number;
  autoPublic: boolean;
  preferredLanguages: string[];
  maxConcurrent: number;
  preferredAgent: string;
  automationMode: string;
  timeBudgetMinutes: number;
  vaultLabel: string;
  githubConnected: boolean;
  localOnly: boolean;
  writingVoice?: string;
};

export type PublicationItem = {
  id: string;
  title: string;
  privacy: RecordPrivacy;
  readiness: number;
  reviewed: boolean;
  testsPassing: boolean;
  readmeReady: boolean;
  attributionReady: boolean;
  blockers: string[];
  storyReview: "pending" | "approved";
};

export type ViewerSnapshot = {
  generatedAt: string;
  initialized: boolean;
  workspaceName: string;
  ownerName: string;
  greeting: string;
  focus: string;
  mainGoal: MainGoal | null;
  streakDays: number;
  summary: {
    queued: number;
    active: number;
    completed: number;
    lessons: number;
    graphNodes: number;
    privateRepos: number;
  };
  queue: QueueItem[];
  experiments: Experiment[];
  timeline: TimelineItem[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  sources: SourceItem[];
  interests: InterestItem[];
  settings: ViewerSettings;
  publication: PublicationItem[];
  warnings: string[];
};

export type ViewerMutation = Partial<
  Pick<
    QueueItem,
    "starred" | "reviewed" | "status" | "rank" | "scheduledAt"
  >
> & { publicStoryReview?: "pending" | "approved" };
