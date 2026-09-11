import type { VendorConfig } from "@/config/vendors";

export function copyFor(vendor: VendorConfig): {
  createdLvl: string;
  createdHv: string;
  cvs: string;
  engResolved: string;
  engCurrent: string;
  pending: string;
  pendingTrend: string;
  idle: string;
  sku: string;
  softSku: string;
} {
  const n = vendor.name;
  if (vendor.supportLevelChart === "ebay-split") {
    return {
      createdLvl: `Aviz line = non-L3 tickets (L1/L2/L3 Internal); the Vendor tickets (L3) are split into one line per hardware vendor (Edgecore, Celestica, …; "untagged" = no vendor set). Responds to the Product filter · click a point to list those tickets.`,
      createdHv: `One line per hardware vendor. Filter by severity and support level. ${n} tickets by hardware vendor. Includes L3 tickets with no vendor set, shown as "(untagged)". Filter by severity & support level · click a point to list them.`,
      cvs: `Intake vs resolution over time. Solved = tickets that reached a Solved/Resolved stage. Responds to the Product filter. A solved line above created means the backlog is shrinking.`,
      engResolved: `Rows = engineers, columns = periods from the time range above. Account-wide for ${n} · click any number to list that engineer's resolved tickets for the period.`,
      engCurrent: `Open ${n} tickets each engineer owns right now (still unresolved), bucketed by created date within the time range. Rows = engineers, columns = period · click any number to list those tickets.`,
      pending: `Currently awaiting customer reply · click to list all.`,
      pendingTrend: `By the period each ticket came in · click a bar to list that period's pending tickets.`,
      idle: `Open tickets whose last customer/agent comment is older than the selected threshold, grouped by current stage. Responds to product & severity filters.`,
      sku: `One line per hardware model/SKU over time · follows the time range · click a point to list that SKU's tickets.`,
      softSku: `Rows = model/SKU, columns = software build · click a cell to list those tickets.`,
    };
  }
  return {
    createdLvl: `Two lines: Vendor = tickets at L3 support level; Aviz = everything else (L1 / L2 / L3 Internal / unset). Responds to the Product filter · click a point to list those tickets (open & solved).`,
    createdHv: `One line per hardware vendor. Filter by severity and support level. Account-wide for ${n} — not product-filtered · click a point to list tickets.`,
    cvs: `Intake vs resolution over time. Solved = tickets that reached a Solved/Resolved stage. Responds to the Product filter. A solved line above created means the backlog is shrinking.`,
    engResolved: `Rows = engineers, columns = periods from the time range above. Account-wide for ${n} · click any number to list that engineer's resolved tickets for the period.`,
    engCurrent: `Open ${n} tickets each engineer owns right now (still unresolved), bucketed by created date within the time range. Rows = engineers, columns = period · click any number to list those tickets.`,
    pending: `Currently awaiting customer reply · click to list all.`,
    pendingTrend: `By the period each ticket came in · click a bar to list that period's pending tickets.`,
    idle: `Open tickets whose last customer/agent comment is older than the selected threshold, grouped by current stage. Responds to product & severity filters.`,
    sku: `One line per hardware model/SKU over time · follows the time range · click a point to list that SKU's tickets.`,
    softSku: `Rows = model/SKU, columns = software build · click a cell to list those tickets.`,
  };
}
