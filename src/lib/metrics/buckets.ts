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

/** Fill every period from the earliest to latest label (zeros for empty periods). */
export function fillBucketRange(labels: string[], bucket: TimeBucket, maxPoints = 60): string[] {
  const sorted = [...new Set(labels.filter(Boolean))].sort();
  if (sorted.length <= 1) return sorted;
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const out: string[] = [];

  if (bucket === "week") {
    const cur = new Date(start + "T00:00:00Z");
    const last = new Date(end + "T00:00:00Z");
    while (cur <= last) {
      out.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
  } else if (bucket === "month") {
    let [y, m] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  } else {
    const parseQ = (lab: string) => {
      const m = lab.match(/^(\d{4}) Q([1-4])$/);
      if (!m) return null;
      return { y: Number(m[1]), q: Number(m[2]) };
    };
    const a = parseQ(start);
    const b = parseQ(end);
    if (!a || !b) return sorted;
    let { y, q } = a;
    while (y < b.y || (y === b.y && q <= b.q)) {
      out.push(`${y} Q${q}`);
      q += 1;
      if (q > 4) {
        q = 1;
        y += 1;
      }
    }
  }

  // Keep charts readable: trim to the most recent window when history is long.
  if (out.length > maxPoints) return out.slice(out.length - maxPoints);
  return out;
}
