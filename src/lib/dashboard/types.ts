export type Severity = "blocker" | "high" | "medium" | "low";

/** Raw ticket mapped from a DevRev work item. */
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
  lastCommentDate: string | null;
  isOpen: boolean;
  isSolvedStage: boolean;
  supportLevel: string;
  hardwareVendor: string;
  ownerName: string;
  priorityLabel: string;
};

/** RMA-classified ticket for the dashboard UI. */
export type RmaTicket = {
  id: string;
  title: string;
  sku: string;
  vendor: string;
  sev: Severity;
  status: string;
  date: string;
  host: string;
  solved: boolean;
  y: number;
  m: number;
  q: number;
  ym: string;
  hi: boolean;
};

export type DashboardPayload = {
  vendor: string;
  generatedAt: string;
  tickets: RmaTicket[];
  sourceCount: number;
};
