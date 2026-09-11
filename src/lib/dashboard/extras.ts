import type { VendorConfig } from "@/config/vendors";
import type { DashboardTicket, TimeBucket } from "@/lib/dashboard/types";
import { bucketLabel, fillBucketRange } from "@/lib/metrics/buckets";
import type { BinDef } from "@/lib/metrics/range";

export function isRmaTicket(t: DashboardTicket): boolean {
  return /\bRMA\b/i.test(t.title) || /\[RMA/i.test(t.title) || /\bRMA:/i.test(t.title) || /RMA/i.test(t.title);
}

export { copyFor } from "@/lib/dashboard/copy";

export function isPendingCustomer(t: DashboardTicket, vendor: VendorConfig): boolean {
  if (!t.isOpen) return false;
  if (vendor.pendingCustomerStageIds.includes(t.stageKey)) return true;
  return /awaiting customer/i.test(t.stageName);
}

export function engineerName(t: DashboardTicket): string {
  const n = (t.ownerName || "").trim();
  return n || "(unassigned)";
}

export type EngineerMatrix = {
  periods: string[];
  periodLabels: Record<string, string>;
  engineers: string[];
  cells: Record<string, Record<string, DashboardTicket[]>>;
  rowTot: Record<string, number>;
  colTot: Record<string, number>;
  grand: number;
};

/** Range-anchored matrix (same bins as creation trends). */
export function buildEngineerMatrixFromBins(
  tickets: DashboardTicket[],
  bins: BinDef[],
  dateOf: (t: DashboardTicket) => string | null,
): EngineerMatrix {
  const periods = bins.map((b) => b.key);
  const periodLabels: Record<string, string> = {};
  bins.forEach((b) => {
    periodLabels[b.key] = b.label;
  });
  const cells: Record<string, Record<string, DashboardTicket[]>> = {};

  tickets.forEach((t) => {
    const iso = dateOf(t)?.slice(0, 10);
    if (!iso) return;
    const bin = bins.find((b) => iso >= b.start && iso <= b.end);
    if (!bin) return;
    const eng = engineerName(t);
    cells[bin.key] = cells[bin.key] || {};
    cells[bin.key][eng] = cells[bin.key][eng] || [];
    cells[bin.key][eng].push(t);
  });

  const engTot: Record<string, number> = {};
  periods.forEach((p) => {
    Object.keys(cells[p] || {}).forEach((e) => {
      engTot[e] = (engTot[e] || 0) + (cells[p][e]?.length || 0);
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
  const rowTot: Record<string, number> = {};
  engineers.forEach((e) => {
    rowTot[e] = periods.reduce((s, p) => s + (cells[p]?.[e]?.length || 0), 0);
  });

  return { periods, periodLabels, engineers, cells, rowTot, colTot, grand };
}

export function buildEngineerMatrix(
  tickets: DashboardTicket[],
  bucket: TimeBucket,
  dateOf: (t: DashboardTicket) => string | null,
): EngineerMatrix {
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
  const periodLabels: Record<string, string> = {};
  periods.forEach((p) => {
    periodLabels[p] = matrixPeriodLabel(bucket, p);
  });
  return { periods, periodLabels, engineers, cells, rowTot: engTot, colTot, grand };
}

export function buildSoftSkuMatrix(tickets: DashboardTicket[]): {
  skus: string[];
  softwares: string[];
  cells: Record<string, Record<string, DashboardTicket[]>>;
  rowTot: Record<string, number>;
  colTot: Record<string, number>;
  grand: number;
} {
  const cells: Record<string, Record<string, DashboardTicket[]>> = {};
  const skuTot: Record<string, number> = {};
  const softTot: Record<string, number> = {};
  tickets.forEach((t) => {
    const sku = t.modelSku || "(unspecified)";
    const soft = t.software || "(unspecified)";
    cells[sku] = cells[sku] || {};
    cells[sku][soft] = cells[sku][soft] || [];
    cells[sku][soft].push(t);
    skuTot[sku] = (skuTot[sku] || 0) + 1;
    softTot[soft] = (softTot[soft] || 0) + 1;
  });
  const skus = Object.keys(skuTot).sort((a, b) => skuTot[b] - skuTot[a] || a.localeCompare(b));
  const softwares = Object.keys(softTot).sort((a, b) => softTot[b] - softTot[a] || a.localeCompare(b));
  const colTot: Record<string, number> = {};
  let grand = 0;
  softwares.forEach((s) => {
    let n = 0;
    skus.forEach((sku) => {
      n += cells[sku]?.[s]?.length || 0;
    });
    colTot[s] = n;
    grand += n;
  });
  return { skus, softwares, cells, rowTot: skuTot, colTot, grand };
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
