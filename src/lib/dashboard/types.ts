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
  actualCloseDate: string | null;
  modifiedDate: string | null;
  /** Last customer/agent timeline comment; null = none. Used for idle. */
  lastCommentDate: string | null;
  isOpen: boolean;
  supportLevel: string;
  hardwareVendor: string;
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
