/** Sprint label: YYYY-MM H1 (1–15) or H2 (16–end). */
export function sprintLabelFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const half = d.getUTCDate() <= 15 ? "H1" : "H2";
  return `${y}-${m} ${half}`;
}

export function sprintYear(label: string): number {
  return parseInt(label.slice(0, 4), 10);
}

export function compareSprintLabels(a: string, b: string): number {
  return a.localeCompare(b);
}

export function daysSince(iso: string | null, now: Date): number {
  if (!iso) return 999;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 999;
  return Math.floor((now.getTime() - t.getTime()) / 86400000);
}
