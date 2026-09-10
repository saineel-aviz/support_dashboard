import type { VendorConfig } from "@/config/vendors";
import type { DashboardTicket, TimeBucket } from "@/lib/dashboard/types";
import { bucketLabel, fillBucketRange } from "@/lib/metrics/buckets";

export function isRmaTicket(t: DashboardTicket): boolean {
  return /\bRMA\b/i.test(t.title) || /\[RMA/i.test(t.title) || /\bRMA:/i.test(t.title) || /RMA/i.test(t.title);
}

export function isPendingCustomer(t: DashboardTicket, vendor: VendorConfig): boolean {
  if (!t.isOpen) return false;
  if (vendor.pendingCustomerStageIds.includes(t.stageKey)) return true;
  return /awaiting customer/i.test(t.stageName);
}

export function engineerName(t: DashboardTicket): string {
  const n = (t.ownerName || "").trim();
  return n || "(unassigned)";
}

export type MatrixCell = { period: string; engineer: string; count: number; tickets: DashboardTicket[] };

export function buildEngineerMatrix(
  tickets: DashboardTicket[],
  bucket: TimeBucket,
  dateOf: (t: DashboardTicket) => string | null,
): { periods: string[]; engineers: string[]; cells: Record<string, Record<string, DashboardTicket[]>>; rowTot: Record<string, number>; colTot: Record<string, number>; grand: number } {
  const cells: Record<string, Record<string, DashboardTicket[]>> = {};
  const periodSet = new Set<string>();
  tickets.forEach((t) => {
    const iso = dateOf(t);
    const lab = bucketLabel(iso, bucket);
    if (!lab) return;
    periodSet.add(lab);
    const eng = engineerName(t);
    cells[lab] = cells[lab] || {};
    cells[lab][eng] = cells[lab][eng] || [];
    cells[lab][eng].push(t);
  });
  // Full continuous range — no period cap (match reference HTML history).
  const periods = fillBucketRange([...periodSet], bucket, Number.MAX_SAFE_INTEGER);
  const engTot: Record<string, number> = {};
  periods.forEach((p) => {
    const row = cells[p] || {};
    Object.keys(row).forEach((e) => {
      engTot[e] = (engTot[e] || 0) + row[e].length;
    });
  });
  const engineers = Object.keys(engTot).sort((a, b) => engTot[b] - engTot[a] || a.localeCompare(b));
  const colTot: Record<string, number> = {};
  let grand = 0;
  periods.forEach((p) => {
    let n = 0;
    engineers.forEach((e) => {
      n += cells[p]?.[e]?.length || 0;
    });
    colTot[p] = n;
    grand += n;
  });
  return { periods, engineers, cells, rowTot: engTot, colTot, grand };
}

export function matrixPeriodLabel(bucket: TimeBucket, key: string): string {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (bucket === "week" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const mo = Number(key.slice(5, 7));
    return `${MON[mo - 1]} ${key.slice(8, 10)}`;
  }
  if (bucket === "month" && /^\d{4}-\d{2}$/.test(key)) {
    const mo = Number(key.slice(5, 7));
    return `${MON[mo - 1]} '${key.slice(2, 4)}`;
  }
  if (bucket === "quarter") {
    const m = key.match(/^(\d{4}) Q([1-4])$/);
    if (m) return `Q${m[2]} '${m[1].slice(2)}`;
  }
  return key;
}

export function copyFor(
  vendor: VendorConfig,
): {
  createdLvl: string;
  createdHv: string;
  solved: string;
  cvs: string;
  engResolved: string;
  engCurrent: string;
  pending: string;
  pendingTrend: string;
  rma: string;
  rmaTrend: string;
  idle: string;
} {
  const n = vendor.name;
  if (vendor.supportLevelChart === "ebay-split") {
    return {
      createdLvl: `Aviz line = non-L3 tickets (L1/L2/L3 Internal); Vendor tickets (L3) are split into one line per hardware vendor (Edgecore, Celestica, …; "untagged" = no vendor set). Responds to the Product filter · click a point to list those tickets.`,
      createdHv: `One line per hardware vendor. Filter by severity and support level. ${n} tickets by hardware vendor. Includes L3 tickets with no vendor set, shown as "(untagged)". Filter by severity & support level · click a point to list them.`,
      solved: `Count of tickets that reached a Solved or Resolved stage, placed in the period they reached it. Responds to the Product filter · click a point to list the solved tickets.`,
      cvs: `Intake vs resolution over time. Solved = tickets that reached a Solved/Resolved stage. Responds to the Product filter. A solved line above created means the backlog is shrinking.`,
      engResolved: `Rows = engineers, columns = periods. Account-wide for ${n} · click any number to list that engineer's resolved tickets for the period.`,
      engCurrent: `Open ${n} tickets each engineer owns right now (still unresolved), bucketed by the period they came in. Rows = engineers, columns = period · click any number to list those tickets.`,
      pending: `Currently awaiting customer reply · click to list all.`,
      pendingTrend: `By the period each ticket came in · click a point to list that period's pending tickets.`,
      rma: `All-time RMA-related tickets (title contains RMA) · click to list all.`,
      rmaTrend: `By the period each RMA ticket came in · click a point to list that period's tickets.`,
      idle: `Open tickets whose last customer/agent comment is older than the selected threshold, grouped by current stage. Responds to product & severity filters.`,
    };
  }
  return {
    createdLvl: `Two lines: Vendor = tickets at L3 support level; Aviz = everything else (L1 / L2 / L3 Internal / unset). Responds to the Product filter · click a point to list those tickets (open & solved).`,
    createdHv: `One line per hardware vendor. Filter by severity and support level. Account-wide for ${n} — not product-filtered · click a point to list tickets.`,
    solved: `Count of tickets that reached a Solved or Resolved stage, placed in the period they reached it. Responds to the Product filter · click a point to list the solved tickets.`,
    cvs: `Intake vs resolution over time. Solved = tickets that reached a Solved/Resolved stage. Responds to the Product filter. A solved line above created means the backlog is shrinking.`,
    engResolved: `Rows = engineers, columns = periods. Account-wide for ${n} · click any number to list that engineer's resolved tickets for the period.`,
    engCurrent: `Open ${n} tickets each engineer owns right now (still unresolved), bucketed by the period they came in. Rows = engineers, columns = period · click any number to list those tickets.`,
    pending: `Currently awaiting customer reply · click to list all.`,
    pendingTrend: `By the period each ticket came in · click a point to list that period's pending tickets.`,
    rma: `All-time RMA-related tickets (title contains RMA) · click to list all.`,
    rmaTrend: `By the period each RMA ticket came in · click a point to list that period's tickets.`,
    idle: `Open tickets whose last customer/agent comment is older than the selected threshold, grouped by current stage. Responds to product & severity filters.`,
  };
}
