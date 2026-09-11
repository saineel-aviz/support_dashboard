export type Severity = "blocker" | "high" | "medium" | "low";

export type DashboardTicket = {
  id: string;
  displayId: string;
  title: string;
  product: string;
  accountKey: string;
  accountName: string;
  stageKey: string;
  stageName: string;
  severity: Severity;
  createdDate: string | null;
  /** Date ticket reached Solved/Resolved (custom solved_date / actual_close). */
  actualCloseDate: string | null;
  modifiedDate: string | null;
  /** Last customer/agent timeline comment; null = none. Used for idle. */
  lastCommentDate: string | null;
  isOpen: boolean;
  /** True when current stage is Solved (44) or Resolved (19). */
  isSolvedStage: boolean;
  supportLevel: string;
  hardwareVendor: string;
  /** Hardware model / SKU (AS9716, Wistron ES1227, …). */
  modelSku: string;
  /** NOS / software image family (Edgecore-SONiC, Celestica 4.0.15, …). */
  software: string;
  ownerName: string;
  priorityLabel: string;
};

export type DashboardPayload = {
  vendor: string;
  generatedAt: string;
  tickets: DashboardTicket[];
};

export type DashboardFilter = {
  year: string;
  product: string;
  stage: string;
  severity: string;
};

export type TimeBucket = "week" | "month" | "quarter";
