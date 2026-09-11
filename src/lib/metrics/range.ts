import type { TimeBucket } from "@/lib/dashboard/types";

export type DateRange = { from: string | null; to: string | null };

export type RangePreset = "30" | "90" | "qtd" | "ytd" | "all";

export type BinDef = {
  key: string;
  label: string;
  start: string;
  end: string;
};

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDay(iso: string): Date {
  return new Date(iso.slice(0, 10) + "T00:00:00Z");
}

/** Auto granularity from day-span: ≤45d weekly, ≤400d monthly, else quarterly. */
export function autoGranularity(range: DateRange, fallback: TimeBucket = "month"): TimeBucket {
  if (!range.from || !range.to) return fallback;
  const days = Math.round((parseDay(range.to).getTime() - parseDay(range.from).getTime()) / 86400000);
  if (days <= 45) return "week";
  if (days <= 400) return "month";
  return "quarter";
}

export function presetRange(preset: RangePreset, todayIso: string): DateRange {
  const today = parseDay(todayIso);
  if (preset === "all") return { from: null, to: null };
  if (preset === "30") {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 30);
    return { from: isoDay(d), to: todayIso };
  }
  if (preset === "90") {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 90);
    return { from: isoDay(d), to: todayIso };
  }
  if (preset === "qtd") {
    const m = today.getUTCMonth();
    const qs = Math.floor(m / 3) * 3;
    const from = `${todayIso.slice(0, 4)}-${String(qs + 1).padStart(2, "0")}-01`;
    return { from, to: todayIso };
  }
  // ytd
  return { from: `${todayIso.slice(0, 4)}-01-01`, to: todayIso };
}

export function inDateRange(iso: string | null, range: DateRange): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** Effective [lo, hi] window: explicit range, else min/max of provided dates. */
export function rangeBounds(range: DateRange, dates: Array<string | null>, todayIso: string): { lo: string; hi: string } {
  let lo = range.from;
  let hi = range.to;
  if (!lo || !hi) {
    let mn: string | null = null;
    let mx: string | null = null;
    dates.forEach((c) => {
      if (!c) return;
      const d = c.slice(0, 10);
      if (!mn || d < mn) mn = d;
      if (!mx || d > mx) mx = d;
    });
    lo = lo || mn || todayIso;
    hi = hi || mx || todayIso;
  }
  if (lo > hi) return { lo: hi, hi: lo };
  return { lo, hi };
}

/** Ordered bins for the current granularity (start/end inclusive ISO). */
export function binDefs(range: DateRange, gran: TimeBucket, dates: Array<string | null>, todayIso: string): BinDef[] {
  const { lo, hi } = rangeBounds(range, dates, todayIso);
  const out: BinDef[] = [];

  if (gran === "week") {
    const s = parseDay(lo);
    while (isoDay(s) <= hi) {
      const e = new Date(s);
      e.setUTCDate(e.getUTCDate() + 6);
      const end = isoDay(e) > hi ? hi : isoDay(e);
      out.push({
        key: isoDay(s),
        label: `${MON3[s.getUTCMonth()]} ${String(s.getUTCDate()).padStart(2, "0")}`,
        start: isoDay(s),
        end,
      });
      s.setUTCDate(s.getUTCDate() + 7);
    }
  } else if (gran === "quarter") {
    let y = Number(lo.slice(0, 4));
    let q = Math.floor((Number(lo.slice(5, 7)) - 1) / 3);
    while (true) {
      const sm = q * 3 + 1;
      const startISO = `${y}-${String(sm).padStart(2, "0")}-01`;
      if (startISO > hi) break;
      const em = sm + 2;
      const eDate = new Date(Date.UTC(y, em, 0));
      const endISO = isoDay(eDate) > hi ? hi : isoDay(eDate);
      if (endISO >= lo) {
        out.push({
          key: `${y}-${String(sm).padStart(2, "0")}`,
          label: `Q${q + 1} '${String(y).slice(2)}`,
          start: startISO,
          end: endISO,
        });
      }
      q += 1;
      if (q > 3) {
        q = 0;
        y += 1;
      }
    }
  } else {
    let y = Number(lo.slice(0, 4));
    let m = Number(lo.slice(5, 7)) - 1;
    while (true) {
      const startISO = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      if (startISO > hi) break;
      const eDate = new Date(Date.UTC(y, m + 1, 0));
      const endISO = isoDay(eDate) > hi ? hi : isoDay(eDate);
      if (endISO >= lo) {
        out.push({
          key: `${y}-${String(m + 1).padStart(2, "0")}`,
          label: `${MON3[m]} '${String(y).slice(2)}`,
          start: startISO,
          end: endISO,
        });
      }
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }

  return out;
}

export function ticketsInBin<T extends { createdDate: string | null }>(
  tickets: T[],
  bin: BinDef,
  dateOf: (t: T) => string | null = (t) => t.createdDate,
): T[] {
  return tickets.filter((t) => {
    const iso = dateOf(t)?.slice(0, 10);
    if (!iso) return false;
    return iso >= bin.start && iso <= bin.end;
  });
}

export function formatRangeInfo(range: DateRange, gran: TimeBucket): string {
  const g = `${gran}ly buckets`;
  const fmt = (iso: string | null) => {
    if (!iso) return "…";
    const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  if (range.from || range.to) {
    return `Showing ${fmt(range.from)} → ${fmt(range.to)} · ${g}`;
  }
  return `All time · ${g}`;
}
