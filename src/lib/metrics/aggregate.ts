import { STAGE_LABELS, productLabel, type VendorConfig } from "@/config/vendors";
import type { DashboardFilter, DashboardTicket } from "@/lib/dashboard/types";
import { sprintLabelFromIso, sprintYear } from "@/lib/metrics/sprints";

export function stageDisplay(key: string, name: string): string {
  return STAGE_LABELS[key] || name || key;
}

export function ticketYear(t: DashboardTicket): number | null {
  const iso = t.createdDate || t.modifiedDate;
  if (!iso) return null;
  const y = new Date(iso).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

export function filterTickets(
  tickets: DashboardTicket[],
  f: DashboardFilter,
  opts?: { openOnly?: boolean },
): DashboardTicket[] {
  return tickets.filter((t) => {
    if (opts?.openOnly && !t.isOpen) return false;
    if (f.product && t.product !== f.product) return false;
    if (f.stage && t.stageKey !== f.stage) return false;
    if (f.severity && t.severity !== f.severity) return false;
    if (f.year) {
      const y = ticketYear(t);
      if (y !== parseInt(f.year, 10)) return false;
    }
    return true;
  });
}

export function closedInSprint(t: DashboardTicket): string | null {
  if (t.isOpen) return null;
  return sprintLabelFromIso(t.actualCloseDate || t.modifiedDate);
}

export function createdInSprint(t: DashboardTicket): string | null {
  return sprintLabelFromIso(t.createdDate);
}

export function countByProduct(
  tickets: DashboardTicket[],
  labelFn: (t: DashboardTicket) => string | null,
  year: string,
): { labels: string[]; byProduct: Record<string, Record<string, number>> } {
  const byProduct: Record<string, Record<string, number>> = {};
  const labelSet = new Set<string>();
  tickets.forEach((t) => {
    const lab = labelFn(t);
    if (!lab) return;
    if (year && sprintYear(lab) !== parseInt(year, 10)) return;
    labelSet.add(lab);
    byProduct[lab] = byProduct[lab] || {};
    const p = t.product || "";
    byProduct[lab][p] = (byProduct[lab][p] || 0) + 1;
  });
  const labels = [...labelSet].sort();
  return { labels, byProduct };
}

export function allProductKeys(tickets: DashboardTicket[], vendor: VendorConfig): string[] {
  const vol: Record<string, number> = {};
  tickets.forEach((t) => {
    vol[t.product] = (vol[t.product] || 0) + 1;
  });
  return Object.keys(vol).sort(
    (a, b) => (vol[b] || 0) - (vol[a] || 0) || productLabel(a, vendor.productLabels).localeCompare(productLabel(b, vendor.productLabels)),
  );
}
