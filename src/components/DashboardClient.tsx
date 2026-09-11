"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Chart,
  BarController,
  LineController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
  Filler,
  type Chart as ChartType,
  type ChartConfiguration,
  type ActiveElement,
  type Plugin,
} from "chart.js";
import { productLabel, vendorList, type VendorConfig } from "@/config/vendors";
import type { DashboardFilter, DashboardPayload, DashboardTicket, TimeBucket } from "@/lib/dashboard/types";
import {
  buildEngineerMatrixFromBins,
  copyFor,
  isPendingCustomer,
} from "@/lib/dashboard/extras";
import { allProductKeys, filterTickets, stageDisplay } from "@/lib/metrics/aggregate";
import { bucketLabel, fillBucketRange, inBucket } from "@/lib/metrics/buckets";
import {
  type DateRange,
  type RangePreset,
  autoGranularity,
  binDefs,
  inDateRange,
} from "@/lib/metrics/range";
import { daysSince } from "@/lib/metrics/sprints";
import { CreationTrends } from "@/components/CreationTrends";
import { FieldSelect } from "@/components/FieldSelect";

Chart.register(
  BarController,
  LineController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
  Filler,
);
Chart.defaults.font.family = "system-ui, sans-serif";
Chart.defaults.color = "#514c4f";
Chart.defaults.layout.padding = { top: 28, right: 12, bottom: 8, left: 4 };
Chart.defaults.plugins.tooltip = {
  ...Chart.defaults.plugins.tooltip,
  backgroundColor: "#161616",
  titleFont: { size: 12 },
  bodyFont: { size: 12 },
  padding: 10,
  cornerRadius: 8,
  displayColors: true,
  caretPadding: 8,
};

/** Point / bar value labels — toggled per chart via plugins.valueLabels.enabled */
const valueLabels: Plugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const pluginOpts = (chart.options.plugins as { valueLabels?: { enabled?: boolean } } | undefined)?.valueLabels;
    if (pluginOpts?.enabled === false) return;

    const ctx = chart.ctx;
    const type = (chart.config as { type?: string }).type;
    const area = chart.chartArea;
    if (!area) return;
    const dsCount = chart.data.datasets.length;
    const narrow = typeof window !== "undefined" && window.innerWidth < 640;

    ctx.save();
    ctx.font = narrow ? "700 9px ui-monospace, monospace" : "700 10px ui-monospace, monospace";
    chart.data.datasets.forEach((_ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      // Keep labels above the marker; alternate height slightly on multi-line charts.
      const above = dsCount > 1 ? (di % 2 === 0 ? 16 : 11) : 14;
      meta.data.forEach((el, i) => {
        const v = chart.data.datasets[di].data[i];
        if (v === null || v === undefined || v === 0) return;
        if (type === "line") {
          let y = el.y - above;
          if (y < area.top + 10) y = area.top + 10;
          ctx.fillStyle = "#302e2f";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(String(v), el.x, y);
        } else {
          const horizontal = chart.options.indexAxis === "y";
          ctx.fillStyle = "#302e2f";
          if (horizontal) {
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(v), el.x + 5, el.y);
          } else {
            let y = el.y - 8;
            if (y < area.top + 10) y = area.top + 10;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(String(v), el.x, y);
          }
        }
      });
    });
    ctx.restore();
  },
};
Chart.register(valueLabels);

type ChartId = "idle15" | "pc";

function LabelsToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={show ? "Hide point numbers" : "Show point numbers"}
      aria-label={show ? "Hide point numbers" : "Show point numbers"}
      aria-pressed={show}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
        show ? "border-ink bg-brand text-ink" : "border-line bg-surface text-subtle hover:border-ink hover:text-ink"
      }`}
    >
      {show ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      )}
    </button>
  );
}

function ChartScrollFrame({ points, tall, children }: { points: number; tall?: boolean; children: ReactNode }) {
  const [mobileWide, setMobileWide] = useState(false);
  const minWidth = chartMinWidth(Math.max(points, 1));
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setMobileWide(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !mobileWide) return;
    // Start at the newest end of the series on phones.
    el.scrollLeft = el.scrollWidth;
  }, [points, minWidth, mobileWide]);

  return (
    <div ref={scrollerRef} className="chart-scroll">
      <div className={tall ? "chart-box-tall" : "chart-box"} style={mobileWide ? { minWidth } : undefined}>
        {children}
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatAxisLabel(raw: string, bucket: TimeBucket): string {
  if (bucket === "week" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const mo = Number(raw.slice(5, 7));
    const day = Number(raw.slice(8, 10));
    const yy = raw.slice(2, 4);
    return `${MONTHS[mo - 1] ?? mo} ${day} '${yy}`;
  }
  if (bucket === "month" && /^\d{4}-\d{2}$/.test(raw)) {
    const mo = Number(raw.slice(5, 7));
    return `${MONTHS[mo - 1] ?? mo} '${raw.slice(2, 4)}`;
  }
  if (bucket === "quarter" && /^(\d{4}) Q([1-4])$/.test(raw)) {
    const m = raw.match(/^(\d{4}) Q([1-4])$/);
    if (m) return `Q${m[2]} '${m[1].slice(2)}`;
  }
  return raw;
}

function displayLabels(raw: string[], bucket: TimeBucket): string[] {
  return raw.map((l) => formatAxisLabel(l, bucket));
}

function linePointStyle(labelCount: number) {
  const dense = labelCount > 18;
  const mid = labelCount > 12;
  return {
    pointRadius: dense ? 2 : mid ? 2.5 : 3.5,
    pointHoverRadius: dense ? 5 : 6,
    borderWidth: dense ? 2 : 2.5,
  };
}

function xScaleOptions(labelCount: number) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  // Mobile charts are wide + scrollable, so allow more ticks than the old compact view.
  let maxTicksLimit = 12;
  if (narrow) maxTicksLimit = Math.min(labelCount, Math.max(8, Math.ceil(labelCount / 2)));
  else if (labelCount > 40) maxTicksLimit = 8;
  else if (labelCount > 24) maxTicksLimit = 10;
  else if (labelCount > 14) maxTicksLimit = 12;
  return {
    grid: { display: false },
    border: { display: false },
    ticks: {
      autoSkip: true,
      maxTicksLimit,
      maxRotation: narrow && labelCount > 12 ? 45 : 0,
      minRotation: narrow && labelCount > 12 ? 45 : 0,
      autoSkipPadding: narrow ? 4 : 8,
      font: { size: narrow ? 10 : 11 },
    },
  };
}

function chartMinWidth(points: number): number {
  // ~36px per point on phones — wide enough to read, contained in chart-scroll.
  return Math.max(points * 36, 280);
}

function yScaleOptions(opts?: { stacked?: boolean }) {
  return {
    beginAtZero: true,
    // Extra headroom so point labels sit above peaks without clipping.
    grace: opts?.stacked ? "10%" : "28%",
    grid: { color: "rgba(0,0,0,0.06)" },
    border: { display: false },
    ticks: { precision: 0, font: { size: 11 } },
  };
}

function chartTitle(text: string) {
  return {
    display: true,
    text,
    font: { size: 12, weight: "normal" as const },
    color: "#7a7579",
    padding: { top: 0, bottom: 12 },
  };
}

const chartLayout = { padding: { top: 18, right: 10, bottom: 4, left: 2 } };

const TKT_BASE = "https://app.devrev.ai/works/";
const C = {
  y: "#ffe600",
  dark: "#302e2f",
  blue: "#3968f6",
  blueL: "#5996ff",
  green: "#7adb12",
  red: "#ff4570",
  orange: "#ff893a",
  purple: "#8854f6",
  grey: "#a5a2a4",
};
const SEVCOL: Record<string, string> = {
  blocker: C.red,
  high: C.orange,
  medium: C.blue,
  low: C.green,
};
const LVLLABEL: Record<string, string> = {
  L1: "L1",
  L2: "L2",
  L3: "Vendor",
  "L3 Internal": "L3 Internal",
  "(none)": "(none)",
};
function toast(msg: string) {
  let t = document.getElementById("__toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "__toast";
    t.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#161616;color:#fff;padding:11px 18px;border-radius:9999px;font-size:13px;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  window.setTimeout(() => {
    t!.style.opacity = "0";
  }, 2200);
}

function fmtLast(iso: string | null, now: Date) {
  if (!iso) return "no comments";
  return `${iso.slice(0, 10)} (${daysSince(iso, now)}d)`;
}

function idleAge(t: { lastCommentDate: string | null }, now: Date) {
  return daysSince(t.lastCommentDate, now);
}

/** Date a ticket reached Solved/Resolved — never fall back to modified_date. */
function solvedDate(t: DashboardTicket): string | null {
  if (!t.isSolvedStage) return null;
  return t.actualCloseDate;
}

/** Map UI sentinel for empty/untyped product keys. */
function productMatches(ticketProduct: string, filterProduct: string): boolean {
  if (!filterProduct) return true;
  const want = filterProduct === "__untyped__" ? "" : filterProduct;
  return ticketProduct === want;
}

function productFilterLabel(filterProduct: string, labels: VendorConfig["productLabels"]): string {
  if (!filterProduct) return "All products";
  const key = filterProduct === "__untyped__" ? "" : filterProduct;
  return productLabel(key, labels);
}

function Seg({ value, onChange }: { value: TimeBucket; onChange: (b: TimeBucket) => void }) {
  return (
    <div className="seg">
      {(["week", "month", "quarter"] as TimeBucket[]).map((b) => (
        <button key={b} type="button" className={value === b ? "on" : ""} data-b={b} onClick={() => onChange(b)}>
          {b === "week" ? "Weekly" : b === "month" ? "Monthly" : "Quarterly"}
        </button>
      ))}
    </div>
  );
}

function IdleDaysSeg({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="seg">
      <button type="button" className={value === 15 ? "on" : ""} onClick={() => onChange(15)}>
        15+ days
      </button>
      <button type="button" className={value === 2 ? "on" : ""} onClick={() => onChange(2)}>
        2+ days
      </button>
    </div>
  );
}

export function DashboardClient({ vendor }: { vendor: VendorConfig }) {
  const summaryKey = `${vendor.slug}DashboardSummary`;
  const copy = useMemo(() => copyFor(vendor), [vendor]);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>({ year: "", product: "", stage: "", severity: "" });
  const [trendRange, setTrendRange] = useState<DateRange>({ from: null, to: null });
  const [trendPreset, setTrendPreset] = useState<RangePreset | null>("all");
  const [pcBucket, setPcBucket] = useState<TimeBucket>("month");
  const [idleChartDays, setIdleChartDays] = useState(vendor.idle15Days);
  const [labelVisibility, setLabelVisibility] = useState<Record<ChartId, boolean>>({
    idle15: true,
    pc: true,
  });
  const [drill, setDrill] = useState<{ title: string; tickets: DashboardTicket[] } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [summary, setSummary] = useState("");
  const [summaryStatus, setSummaryStatus] = useState("");

  const charts = useRef<Record<string, ChartType>>({});
  const idle15Ref = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let lastMsg = "Failed to load dashboard";
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => window.setTimeout(r, 400 * attempt));
        }
        const res = await fetch(`/api/dashboard?vendor=${encodeURIComponent(vendor.slug)}`, { cache: "no-store" });
        const raw = await res.text();
        let data: { error?: string } = {};
        try {
          data = raw ? (JSON.parse(raw) as { error?: string }) : {};
        } catch {
          // Dev HMR sometimes returns an HTML 404 while the API route recompiles.
          if (res.status === 404 || raw.trimStart().startsWith("<!")) {
            lastMsg = "Dashboard API is restarting — retrying…";
            continue;
          }
          lastMsg = `Unexpected response (${res.status})`;
          break;
        }
        if (!res.ok) {
          lastMsg = data.error || `Failed to load (${res.status})`;
          if (res.status === 401) {
            window.location.href = `/login?from=/${vendor.slug}`;
            return;
          }
          setError(lastMsg);
          toast(lastMsg);
          return;
        }
        setPayload(data as DashboardPayload);
        setNow(new Date());
        return;
      }
      setError(lastMsg);
      toast(lastMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setError(msg);
      toast(msg);
    } finally {
      setLoading(false);
    }
  }, [vendor.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(summaryKey);
      if (saved && summaryRef.current) {
        summaryRef.current.innerText = saved;
        setSummary(saved);
      } else if (summaryRef.current) {
        summaryRef.current.innerText = "";
        setSummary("");
      }
    } catch {
      /* ignore */
    }
  }, [summaryKey]);

  const tickets = useMemo(() => payload?.tickets ?? [], [payload]);
  const products = useMemo(() => allProductKeys(tickets, vendor), [tickets, vendor]);
  const years = useMemo(() => {
    const set = new Set<number>();
    tickets.forEach((t) => {
      if (!t.createdDate) return;
      set.add(new Date(t.createdDate).getUTCFullYear());
    });
    return [...set].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
  }, [tickets]);
  const stages = useMemo(() => {
    const m = new Map<string, string>();
    tickets.filter((t) => t.isOpen).forEach((t) => m.set(t.stageKey, t.stageName));
    return [...m.entries()].sort((a, b) => stageDisplay(a[0], a[1]).localeCompare(stageDisplay(b[0], b[1])));
  }, [tickets]);

  const scopedOpen = useMemo(() => filterTickets(tickets, filter, { openOnly: true }), [tickets, filter]);
  const createdScoped = useMemo(() => {
    return tickets.filter((t) => {
      if (!productMatches(t.product, filter.product)) return false;
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      return true;
    });
  }, [tickets, filter.product, filter.year]);
  const hvBase = useMemo(() => {
    return tickets.filter((t) => {
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      return true;
    });
  }, [tickets, filter.year]);

  const idle15 = useMemo(
    () => scopedOpen.filter((t) => idleAge(t, now) >= vendor.idle15Days),
    [scopedOpen, now, vendor.idle15Days],
  );
  const pendingTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (!isPendingCustomer(t, vendor)) return false;
      if (!productMatches(t.product, filter.product)) return false;
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      return true;
    });
  }, [tickets, vendor, filter.product, filter.year]);
  const todayIso = now.toISOString().slice(0, 10);
  const trendGran = useMemo(() => autoGranularity(trendRange, "month"), [trendRange]);

  const resolvedMatrix = useMemo(() => {
    const list = tickets.filter((t) => {
      if (!t.isSolvedStage || !t.actualCloseDate) return false;
      if (!inDateRange(t.actualCloseDate, trendRange)) return false;
      if (filter.year) {
        const y = new Date(t.actualCloseDate).getUTCFullYear();
        if (y !== parseInt(filter.year, 10)) return false;
      }
      return true;
    });
    const dates = list.map((t) => t.actualCloseDate);
    const bins = binDefs(trendRange, trendGran, dates, todayIso);
    return buildEngineerMatrixFromBins(list, bins, solvedDate);
  }, [tickets, filter.year, trendRange, trendGran, todayIso]);

  const currentMatrix = useMemo(() => {
    const list = tickets.filter((t) => {
      if (!t.isOpen) return false;
      if (!inDateRange(t.createdDate, trendRange)) return false;
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      return true;
    });
    const dates = list.map((t) => t.createdDate);
    const bins = binDefs(trendRange, trendGran, dates, todayIso);
    return buildEngineerMatrixFromBins(list, bins, (t) => t.createdDate);
  }, [tickets, filter.year, trendRange, trendGran, todayIso]);
  const blocked = useMemo(() => {
    const bySev = { blocker: 0, high: 1, medium: 2, low: 3 };
    return scopedOpen
      .filter((t) => t.severity === "blocker")
      .sort((a, b) => bySev[a.severity] - bySev[b.severity] || idleAge(b, now) - idleAge(a, now));
  }, [scopedOpen, now]);
  const idle15Sorted = useMemo(() => {
    const bySev = { blocker: 0, high: 1, medium: 2, low: 3 };
    return [...idle15].sort((a, b) => bySev[a.severity] - bySev[b.severity] || idleAge(b, now) - idleAge(a, now));
  }, [idle15, now]);

  /** Point counts drive mobile chart min-width (horizontal scroll). */
  const chartPoints = useMemo(() => {
    const idleChartFiltered = scopedOpen.filter(
      (t) => idleAge(t, now) >= idleChartDays && (!filter.severity || t.severity === filter.severity),
    );
    const labelsForPending = (bucket: TimeBucket, list: DashboardTicket[]) => {
      const set = new Set<string>();
      list.forEach((t) => {
        const lab = bucketLabel(t.createdDate, bucket);
        if (lab) set.add(lab);
      });
      return fillBucketRange([...set], bucket).length;
    };
    return {
      idle15: new Set(idleChartFiltered.map((t) => t.stageKey)).size,
      pc: labelsForPending(pcBucket, pendingTickets),
    };
  }, [scopedOpen, pendingTickets, filter.severity, pcBucket, idleChartDays, now]);

  const scopeText = [
    filter.year || "All years",
    filter.product ? productFilterLabel(filter.product, vendor.productLabels) : "All products",
    vendor.name,
    filter.stage ? stageDisplay(filter.stage, stages.find((s) => s[0] === filter.stage)?.[1] || filter.stage) : null,
    filter.severity ? filter.severity[0].toUpperCase() + filter.severity.slice(1) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function mk(id: string, canvas: HTMLCanvasElement | null, cfg: unknown) {
    if (!canvas) return;
    charts.current[id]?.destroy();
    charts.current[id] = new Chart(canvas, cfg as ChartConfiguration);
  }

  function openDrill(title: string, rows: DashboardTicket[]) {
    setDrill({ title, tickets: rows });
    requestAnimationFrame(() => {
      document.getElementById("drill")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function ticketsInBucket(list: DashboardTicket[], bucket: TimeBucket, label: string, extra?: (t: DashboardTicket) => boolean) {
    return list.filter((t) => inBucket(t.createdDate, bucket, label) && (!extra || extra(t)));
  }

  useEffect(() => {
    const labelsFor = (bucket: TimeBucket, list: DashboardTicket[]) => {
      const set = new Set<string>();
      list.forEach((t) => {
        const lab = bucketLabel(t.createdDate, bucket);
        if (lab) set.add(lab);
      });
      return fillBucketRange([...set], bucket);
    };

    const idleChartFiltered = scopedOpen.filter(
      (t) => idleAge(t, now) >= idleChartDays && (!filter.severity || t.severity === filter.severity),
    );
    const idleStages = [...new Set(idleChartFiltered.map((t) => t.stageKey))].sort((a, b) => {
      const A = idleChartFiltered.filter((t) => t.stageKey === a).length;
      const B = idleChartFiltered.filter((t) => t.stageKey === b).length;
      return B - A;
    });
    const sevList = (["blocker", "high", "medium", "low"] as const).filter((sv) => !filter.severity || sv === filter.severity);
    mk("idle15", idle15Ref.current, {
      type: "bar",
      data: {
        labels: idleStages.map((st) => stageDisplay(st, idleChartFiltered.find((t) => t.stageKey === st)?.stageName || st)),
        datasets: sevList.map((sv) => ({
          label: sv[0].toUpperCase() + sv.slice(1),
          data: idleStages.map((st) => idleChartFiltered.filter((t) => t.stageKey === st && t.severity === sv).length),
          backgroundColor: SEVCOL[sv],
          borderRadius: 4,
          maxBarThickness: 56,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const st = idleStages[els[0].index];
          const sv = sevList[els[0].datasetIndex];
          openDrill(
            `Idle ${idleChartDays}+ days · ${stageDisplay(st, "")} · ${sv}`,
            idleChartFiltered.filter((t) => t.stageKey === st && t.severity === sv),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          title: chartTitle(
            `${idleChartFiltered.length} open tickets idle ${idleChartDays}+ days · click a bar to list them`,
          ),
          valueLabels: { enabled: labelVisibility.idle15 },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              autoSkip: true,
              maxRotation: 0,
              font: { size: typeof window !== "undefined" && window.innerWidth < 640 ? 10 : 11 },
            },
          },
          y: { stacked: true, ...yScaleOptions({ stacked: true }) },
        },
      },
    });

    const pcLabels = labelsFor(pcBucket, pendingTickets);
    const pcCounts = pcLabels.map((lab) => ticketsInBucket(pendingTickets, pcBucket, lab).length);
    const pcPts = linePointStyle(pcLabels.length);
    mk("pc", pcRef.current, {
      type: "line",
      data: {
        labels: displayLabels(pcLabels, pcBucket),
        datasets: [
          {
            label: "Pending (by intake period)",
            data: pcCounts,
            borderColor: C.orange,
            backgroundColor: "rgba(255,137,58,0.12)",
            fill: true,
            tension: 0.35,
            ...pcPts,
            pointBackgroundColor: C.orange,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = pcLabels[els[0].index];
          openDrill(`Pending on customer · ${lab} — tickets`, ticketsInBucket(pendingTickets, pcBucket, lab));
        },
        plugins: {
          legend: { display: false },
          valueLabels: { enabled: labelVisibility.pc },
        },
        scales: { x: xScaleOptions(pcLabels.length), y: yScaleOptions() },
      },
    });

    return () => {
      Object.values(charts.current).forEach((c) => c.destroy());
      charts.current = {};
    };
  }, [scopedOpen, pendingTickets, filter, pcBucket, idleChartDays, labelVisibility, vendor, now]);

  function toggleLabels(id: ChartId) {
    setLabelVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function persistSummary(text: string) {
    setSummary(text);
    try {
      localStorage.setItem(summaryKey, text);
      setSummaryStatus("Saved in browser");
      window.setTimeout(() => setSummaryStatus((s) => (s === "Saved in browser" ? "" : s)), 1500);
    } catch {
      setSummaryStatus("Could not save in this browser");
    }
  }

  function downloadSummary() {
    const blob = new Blob([summary], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${vendor.slug}-dashboard-summary.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSummaryStatus("Saved to file — check your downloads");
    window.setTimeout(() => setSummaryStatus(""), 1800);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="wrap flex min-h-14 flex-wrap items-center justify-between gap-3 py-2.5 sm:min-h-[60px] sm:py-0">
          <nav className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Vendors">
            {vendorList.map((v) => (
              <Link
                key={v.slug}
                href={`/${v.slug}`}
                className={`inline-flex h-9 items-center justify-center rounded-full border-[1.5px] px-3.5 font-mono-ui text-[11px] uppercase leading-none tracking-[0.05em] no-underline ${
                  v.slug === vendor.slug
                    ? "border-brand bg-brand text-ink"
                    : "border-transparent text-subtle hover:border-ink hover:text-ink"
                }`}
              >
                {v.name}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="eyebrow hidden lg:inline">Product support · {vendor.name} (customer view)</span>
            <button className="btn-outline" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              <svg
                className={`h-3.5 w-3.5 ${loading ? "spin" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-2.4-6.1" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <section className="pb-0 pt-4 sm:pb-1 sm:pt-9">
        <div className="wrap">
          <h1 className="text-[22px] leading-[1.05] tracking-tight sm:text-4xl md:text-[44px]">
            Product support — {vendor.name}
          </h1>
          <p className="mt-1.5 hidden max-w-[680px] text-sm text-muted sm:mt-2.5 sm:block sm:text-base">
            Ticket health for the {vendor.name} account. Filter by product, stage and severity — trends cover intake vs resolution,
            and idle tickets flag anything with no comment for {vendor.idleDays}+ days.
          </p>
        </div>
      </section>

      <div className="wrap pb-5 sm:pb-8">
        {error ? <div className="banner-box banner-box-error">{error}</div> : null}
        {loading && !payload ? (
          <div className="load-panel" role="status" aria-live="polite">
            <div className="load-spinner" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">Fetching live tickets from DevRev</p>
            <p className="text-xs text-subtle">Loading {vendor.name} dashboard…</p>
          </div>
        ) : null}
        {loading && payload ? (
          <div className="banner-box flex items-center gap-3">
            <div className="load-spinner !h-5 !w-5 !border-2" aria-hidden="true" />
            <span>Refreshing {vendor.name} tickets from DevRev…</span>
          </div>
        ) : null}

        <div className="mt-3 mb-2 flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5 sm:p-5">
          <FieldSelect
            label="Year"
            value={filter.year}
            onChange={(year) => setFilter((f) => ({ ...f, year }))}
            options={[{ value: "", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          />
          <FieldSelect
            label="Product"
            value={filter.product}
            onChange={(product) => setFilter((f) => ({ ...f, product }))}
            options={[
              { value: "", label: "All products" },
              ...products.map((p) => ({
                value: p || "__untyped__",
                label: productLabel(p, vendor.productLabels),
              })),
            ]}
          />
          <FieldSelect
            label="Stage"
            value={filter.stage}
            onChange={(stage) => setFilter((f) => ({ ...f, stage }))}
            options={[
              { value: "", label: "All stages" },
              ...stages.map(([k, name]) => ({ value: k, label: stageDisplay(k, name) })),
            ]}
          />
          <FieldSelect
            label="Severity"
            value={filter.severity}
            onChange={(severity) => setFilter((f) => ({ ...f, severity }))}
            options={[
              { value: "", label: "All severities" },
              { value: "blocker", label: "Blocker" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
          <button
            className="btn-outline w-full sm:w-auto"
            type="button"
            onClick={() => setFilter({ year: "", product: "", stage: "", severity: "" })}
          >
            Reset
          </button>
          <span className="w-full text-xs text-subtle sm:ml-auto sm:w-auto sm:self-center sm:text-[13px]">Scope: {scopeText}</span>
        </div>

        <div className="card-panel my-4 border-t-[3px] border-t-brand">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="card-title">Summary</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-xs text-subtle">{summaryStatus}</span>
              <button
                className="btn-chip"
                type="button"
                onClick={() => {
                  if (summaryRef.current) summaryRef.current.innerText = "";
                  persistSummary("");
                  setSummaryStatus("Cleared");
                }}
              >
                Clear
              </button>
              <button className="btn-chip-primary" type="button" onClick={downloadSummary}>
                Save to file
              </button>
            </div>
          </div>
          <div
            ref={summaryRef}
            className="summary-box"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Type a summary here…"
            onInput={(e) => persistSummary(e.currentTarget.innerText)}
          />
        </div>

        <CreationTrends
          vendor={vendor}
          tickets={createdScoped}
          hvTickets={hvBase}
          copy={copy}
          openDrill={openDrill}
          todayIso={todayIso}
          range={trendRange}
          preset={trendPreset}
          onRangeChange={setTrendRange}
          onPresetChange={setTrendPreset}
        />

        <div className="mb-2 mt-4 sm:mb-3 sm:mt-7">
          <h2 className="text-base font-semibold sm:text-[26px]">Support engineer workload</h2>
          <p className="mt-1 hidden text-xs text-subtle sm:block sm:text-[13px]">
            Tickets resolved per engineer, and open tickets each engineer owns right now. Follows the time range above
            ({trendGran}ly buckets). Account-wide for {vendor.name} (product filter ignored). Click any cell to list tickets.
          </p>
        </div>

        <div className="card-panel mb-3 sm:mb-5">
          <div className="mb-4 min-w-0">
            <h3 className="card-title">Tickets resolved by engineer</h3>
            <p className="mt-0.5 text-xs text-subtle">{copy.engResolved}</p>
          </div>
          <WorkloadMatrix
            matrix={resolvedMatrix}
            tintRgb="57,104,246"
            totalLabel="Total"
            onCellClick={(period, engineer) => {
              const rows =
                period == null
                  ? resolvedMatrix.periods.flatMap((p) => resolvedMatrix.cells[p]?.[engineer] || [])
                  : resolvedMatrix.cells[period]?.[engineer] || [];
              const bits = period
                ? [`Resolved ${resolvedMatrix.periodLabels[period] || period}`, engineer]
                : [`Resolved (all periods)`, engineer];
              openDrill(`${bits.join(" · ")} — tickets`, rows);
            }}
          />
        </div>

        <div className="card-panel mb-3 sm:mb-5">
          <div className="mb-4 min-w-0">
            <h3 className="card-title">Current workload by engineer</h3>
            <p className="mt-0.5 text-xs text-subtle">{copy.engCurrent}</p>
          </div>
          <WorkloadMatrix
            matrix={currentMatrix}
            tintRgb="255,137,58"
            totalLabel="Open total"
            onCellClick={(period, engineer) => {
              const rows =
                period == null
                  ? currentMatrix.periods.flatMap((p) => currentMatrix.cells[p]?.[engineer] || [])
                  : currentMatrix.cells[period]?.[engineer] || [];
              const bits = period
                ? [`Open · created ${currentMatrix.periodLabels[period] || period}`, engineer]
                : [`Open (all periods)`, engineer];
              openDrill(`${bits.join(" · ")} — tickets`, rows);
            }}
          />
        </div>

        <div className="mb-2 mt-4 sm:mb-3 sm:mt-7">
          <h2 className="text-base font-semibold sm:text-[26px]">Tickets pending on customer</h2>
          <p className="mt-1 hidden text-xs text-subtle sm:block sm:text-[13px]">
            Open {vendor.name} tickets currently awaiting customer reply. Click the total or any point to list them.
          </p>
        </div>

        <div className="mb-3 grid gap-3 sm:mb-5 sm:gap-5 lg:grid-cols-2">
          <div className="card-panel">
            <h3 className="card-title">Overall pending on customer</h3>
            <p className="mt-0.5 text-xs text-subtle">{copy.pending}</p>
            <button
              type="button"
              className="kpi-hit"
              onClick={() => openDrill("Pending on customer — all tickets", pendingTickets)}
            >
              <span className="kpi-num">{pendingTickets.length}</span>
              <span className="text-xs text-subtle">tickets ↗</span>
            </button>
          </div>
          <div className="card-panel">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="card-title">Pending on customer — trend</h3>
                <p className="mt-0.5 text-xs text-subtle">{copy.pendingTrend}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <LabelsToggle show={labelVisibility.pc} onToggle={() => toggleLabels("pc")} />
                <Seg value={pcBucket} onChange={setPcBucket} />
              </div>
            </div>
            <ChartScrollFrame points={chartPoints.pc}>
              <canvas ref={pcRef} />
            </ChartScrollFrame>
          </div>
        </div>

        <p className="mb-2.5 text-xs text-subtle">
          Tip: click any chart point or bar to list the tickets behind it — each row opens the ticket in DevRev.
        </p>

        {drill ? (
          <div className="drill-panel" id="drill">
            <div className="flex flex-col gap-3 bg-ink px-4 py-3 text-surface sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
              <h3 className="text-sm font-bold text-surface sm:text-[15px]">{drill.title}</h3>
              <div className="flex items-center gap-3">
                <span className="font-mono-ui text-xs tracking-[0.04em] text-brand">
                  {drill.tickets.length} ticket{drill.tickets.length === 1 ? "" : "s"}
                </span>
                <button
                  className="rounded-full border-[1.5px] border-faint px-3.5 py-1 font-mono-ui text-[11px] uppercase text-surface hover:border-brand hover:bg-brand hover:text-ink"
                  type="button"
                  onClick={() => setDrill(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {!drill.tickets.length ? (
                <div className="px-5 py-4 text-sm text-subtle">No tickets in this selection.</div>
              ) : null}
              {drill.tickets.map((t) => {
                const status = t.isOpen ? "open" : "solved";
                const created = t.createdDate ? t.createdDate.slice(0, 10) : "—";
                return (
                  <a key={t.id} className="drill-row" href={`${TKT_BASE}${t.displayId}`} target="_blank" rel="noopener noreferrer">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0"
                        style={{ background: t.isOpen ? SEVCOL[t.severity] || C.orange : C.green }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono-ui text-[13px] font-semibold text-blue">{t.displayId}</span>
                          <span className="text-sm text-ink">{t.title}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-subtle">
                          {t.severity} · {LVLLABEL[t.supportLevel] || t.supportLevel} · {t.hardwareVendor} · created {created} ·{" "}
                          {status}
                        </p>
                      </div>
                      <span className="shrink-0 text-faint">↗</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="card-panel mb-3 overflow-hidden sm:mb-5">
          <div className="mb-3 flex flex-col gap-2.5 sm:mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h3 className="card-title">Open tickets with no activity — by stage</h3>
              <p className="mt-0.5 text-xs text-subtle">{copy.idle}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <LabelsToggle show={labelVisibility.idle15} onToggle={() => toggleLabels("idle15")} />
              <IdleDaysSeg value={idleChartDays} onChange={setIdleChartDays} />
            </div>
          </div>
          <ChartScrollFrame points={chartPoints.idle15}>
            <canvas ref={idle15Ref} />
          </ChartScrollFrame>
        </div>

        <div className="mb-2 mt-4 sm:mb-3 sm:mt-7">
          <h2 className="text-base font-semibold sm:text-[26px]">Action lists</h2>
          <p className="mt-1 hidden text-xs text-subtle sm:block sm:text-[13px]">
            Open tickets needing attention. Every row opens in DevRev. Lists respect the filters above.
          </p>
        </div>

        <ActionTable color={C.red} title="Blocked tickets" rows={blocked} now={now} vendor={vendor} />
        <ActionTable
          color={C.dark}
          title={`Idle ${vendor.idle15Days}+ days (no activity)`}
          rows={idle15Sorted}
          now={now}
          vendor={vendor}
        />
      </div>

      <footer className="mt-4 bg-ink py-4 text-faint sm:mt-8 sm:py-6">
        <div className="wrap">
          <p className="font-mono-ui text-[10px] uppercase leading-relaxed tracking-[0.05em] sm:text-[11px]">
            {vendor.name} customer view · data refreshed {payload?.generatedAt ? new Date(payload.generatedAt).toUTCString() : "—"} ·
            products = ticket subtypes · idle = no comment {vendor.idleDays}+ / {vendor.idle15Days}+ days · time-range trends · click chart points for tickets
          </p>
        </div>
      </footer>
    </>
  );
}

type MatrixResult = ReturnType<typeof buildEngineerMatrixFromBins>;

function WorkloadMatrix({
  matrix,
  tintRgb,
  totalLabel,
  onCellClick,
}: {
  matrix: MatrixResult;
  tintRgb: string;
  totalLabel: string;
  onCellClick: (period: string | null, engineer: string) => void;
}) {
  const { periods, periodLabels, engineers, cells, rowTot, colTot, grand } = matrix;
  const maxCell = Math.max(
    1,
    ...periods.flatMap((p) => engineers.map((e) => cells[p]?.[e]?.length || 0)),
  );

  if (!engineers.length) {
    return <div className="px-1 py-3 text-sm text-subtle">No tickets in this selection.</div>;
  }

  return (
    <div className="wl-scroll">
      <table className="wl-table">
        <thead>
          <tr>
            <th>Engineer</th>
            {periods.map((p) => (
              <th key={p}>{periodLabels[p] || p}</th>
            ))}
            <th>{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {engineers.map((e) => (
            <tr key={e}>
              <td>{e}</td>
              {periods.map((p) => {
                const v = cells[p]?.[e]?.length || 0;
                if (!v) {
                  return (
                    <td key={p} className="wl-zero">
                      ·
                    </td>
                  );
                }
                const tint = 0.06 + 0.32 * (v / maxCell);
                return (
                  <td
                    key={p}
                    className="wl-click"
                    style={{ background: `rgba(${tintRgb},${tint.toFixed(3)})` }}
                    onClick={() => onCellClick(p, e)}
                  >
                    {v}
                  </td>
                );
              })}
              <td className="wl-click" onClick={() => onCellClick(null, e)}>
                {rowTot[e] || 0}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>All engineers</td>
            {periods.map((p) => (
              <td key={p}>{colTot[p] || 0}</td>
            ))}
            <td>{grand}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ActionTable({
  color,
  title,
  rows,
  now,
  vendor,
}: {
  color: string;
  title: string;
  rows: DashboardTicket[];
  now: Date;
  vendor: VendorConfig;
}) {
  return (
    <div className="table-shell">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-bold sm:text-[15px]">{title}</h3>
        <span className="ml-auto font-mono-ui text-xs tracking-[0.04em] text-subtle">
          {rows.length} ticket{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden">
        {!rows.length ? (
          <div className="px-4 py-4 text-sm text-subtle">No tickets in this selection.</div>
        ) : (
          rows.map((t) => (
            <a
              key={t.id}
              href={`${TKT_BASE}${t.displayId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-ticket block text-ink no-underline active:bg-brand-soft"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono-ui text-[13px] font-semibold text-blue">{t.displayId}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize text-white" style={{ background: SEVCOL[t.severity] }}>
                  {t.severity}
                </span>
              </div>
              <p className="mt-1 text-sm leading-snug text-ink-soft">{t.title}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-subtle">
                {productLabel(t.product, vendor.productLabels)} · {stageDisplay(t.stageKey, t.stageName)} ·{" "}
                {fmtLast(t.lastCommentDate, now)}
              </p>
            </a>
          ))
        )}
      </div>

      {/* Desktop / tablet table */}
      <div className="table-scroll hidden md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Product</th>
              <th>Account</th>
              <th>Stage</th>
              <th>Severity</th>
              <th>Last comment</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td className="px-5 py-4 text-sm text-subtle" colSpan={7}>
                  No tickets in this selection.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <a
                      className="whitespace-nowrap font-mono-ui font-semibold text-blue no-underline hover:underline"
                      href={`${TKT_BASE}${t.displayId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t.displayId}
                    </a>
                  </td>
                  <td className="max-w-[280px] truncate lg:max-w-[420px]" title={t.title}>
                    {t.title}
                  </td>
                  <td>{productLabel(t.product, vendor.productLabels)}</td>
                  <td>{t.accountName}</td>
                  <td>{stageDisplay(t.stageKey, t.stageName)}</td>
                  <td>
                    <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize text-white" style={{ background: SEVCOL[t.severity] }}>
                      {t.severity}
                    </span>
                  </td>
                  <td>{fmtLast(t.lastCommentDate, now)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
