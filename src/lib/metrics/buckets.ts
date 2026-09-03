import type { TimeBucket } from "@/lib/dashboard/types";

export function weekStart(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function bucketLabel(iso: string | null, bucket: TimeBucket): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  if (day.length < 10) return null;
  if (bucket === "month") return day.slice(0, 7);
  if (bucket === "week") return weekStart(day);
  const y = day.slice(0, 4);
  const mo = Number(day.slice(5, 7));
  if (!Number.isFinite(mo)) return null;
  return `${y} Q${Math.ceil(mo / 3)}`;
}

export function inBucket(iso: string | null, bucket: TimeBucket, label: string): boolean {
  return bucketLabel(iso, bucket) === label;
}
