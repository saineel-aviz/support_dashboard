"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import {
  Chart,
  DoughnutController,
  BarController,
  LineController,
  ArcElement,
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
import { allProductKeys, filterTickets, stageDisplay } from "@/lib/metrics/aggregate";
import { bucketLabel, fillBucketRange, inBucket } from "@/lib/metrics/buckets";
import { daysSince } from "@/lib/metrics/sprints";
import { FieldSelect } from "@/components/FieldSelect";

Chart.register(
  DoughnutController,
  BarController,
  LineController,
  ArcElement,
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
      const stagger = dsCount > 1 ? (di % 2 === 0 ? -2 : 10) : 0;
      meta.data.forEach((el, i) => {
        const v = chart.data.datasets[di].data[i];
        if (v === null || v === undefined || v === 0) return;
        if (type === "line") {
          let y = el.y - 6 + stagger;
          if (y < area.top + 10) y = area.top + 10;
          if (y > area.bottom - 2) y = area.bottom - 2;
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
            let y = el.y - 4;
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

type ChartId = "created" | "createdSev" | "createdLvl" | "createdHv" | "solved" | "cvs" | "idle15";

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
  const minWidth = chartMinWidth(Math.max(points, 1));
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof window === "undefined" || window.innerWidth >= 640) return;
    // Start at the newest end of the series on phones.
    el.scrollLeft = el.scrollWidth;
  }, [points, minWidth]);

  return (
    <div ref={scrollerRef} className="chart-scroll">
      <div className={tall ? "chart-box-tall" : "chart-box"} style={{ minWidth }}>
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
  // ~48px per point on phones so the series stays readable while scrolling.
  return Math.max(points * 48, 320);
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
const SUPPORTLEVELS = ["L1", "L2", "L3", "L3 Internal", "(none)"];
const LVLLABEL: Record<string, string> = {
  L1: "L1",
  L2: "L2",
  L3: "Vendor",
  "L3 Internal": "L3 Internal",
  "(none)": "(none)",
};
const LVLLINECOL: Record<string, string> = {
  L1: C.green,
  L2: C.blue,
  L3: C.orange,
  "L3 Internal": C.purple,
  "(none)": C.grey,
};
const SEVERITIES = ["blocker", "high", "medium", "low"] as const;
const SEVLINECOL: Record<string, string> = {
  blocker: C.red,
  high: C.orange,
  medium: C.blue,
  low: C.green,
};
const HWVENDORS = ["Arista", "Aviz", "Celestica", "Cisco", "Dell", "Edgecore", "Nvidia", "Wistron", "(none)"];
const HVLINECOL: Record<string, string> = {
  Arista: C.red,
  Aviz: C.y,
  Celestica: C.purple,
  Cisco: C.blue,
  Dell: C.blueL,
  Edgecore: C.orange,
  Nvidia: C.green,
  Wistron: C.dark,
  "(none)": C.grey,
};
const SUMMARY_KEY = "ebayDashboardSummary";

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

export function DashboardClient({ vendor }: { vendor: VendorConfig }) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>({ year: "", product: "", stage: "", severity: "" });
  const [hvLevel, setHvLevel] = useState("L3");
  const [hvSev, setHvSev] = useState("");
  const [createdBucket, setCreatedBucket] = useState<TimeBucket>("month");
  const [createdSevBucket, setCreatedSevBucket] = useState<TimeBucket>("month");
  const [createdLvlBucket, setCreatedLvlBucket] = useState<TimeBucket>("month");
  const [createdHvBucket, setCreatedHvBucket] = useState<TimeBucket>("month");
  const [solvedBucket, setSolvedBucket] = useState<TimeBucket>("month");
  const [cvsBucket, setCvsBucket] = useState<TimeBucket>("month");
  const [labelVisibility, setLabelVisibility] = useState<Record<ChartId, boolean>>({
    created: true,
    createdSev: true,
    createdLvl: true,
    createdHv: true,
    solved: true,
    cvs: true,
    idle15: true,
  });
  const [drill, setDrill] = useState<{ title: string; tickets: DashboardTicket[] } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [summary, setSummary] = useState("");
  const [summaryStatus, setSummaryStatus] = useState("");

  const charts = useRef<Record<string, ChartType>>({});
  const createdRef = useRef<HTMLCanvasElement>(null);
  const createdSevRef = useRef<HTMLCanvasElement>(null);
  const createdLvlRef = useRef<HTMLCanvasElement>(null);
  const createdHvRef = useRef<HTMLCanvasElement>(null);
  const solvedRef = useRef<HTMLCanvasElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const idle15Ref = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/${vendor.slug}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || `Failed to load (${res.status})`;
        setError(msg);
        toast(msg);
        return;
      }
      setPayload(data as DashboardPayload);
      setNow(new Date());
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
      const saved = localStorage.getItem(SUMMARY_KEY);
      if (saved && summaryRef.current) {
        summaryRef.current.innerText = saved;
        setSummary(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
  const solvedScoped = useMemo(() => {
    return tickets.filter((t) => {
      if (!t.isSolvedStage || !t.actualCloseDate) return false;
      if (!productMatches(t.product, filter.product)) return false;
      if (filter.year) {
        const y = new Date(t.actualCloseDate).getUTCFullYear();
        if (y !== parseInt(filter.year, 10)) return false;
      }
      return true;
    });
  }, [tickets, filter.product, filter.year]);

  const idleOpen = useMemo(
    () => scopedOpen.filter((t) => idleAge(t, now) >= vendor.idleDays),
    [scopedOpen, now, vendor.idleDays],
  );
  const idle15 = useMemo(
    () => scopedOpen.filter((t) => idleAge(t, now) >= vendor.idle15Days),
    [scopedOpen, now, vendor.idle15Days],
  );
  const blocked = useMemo(() => {
    const bySev = { blocker: 0, high: 1, medium: 2, low: 3 };
    return scopedOpen
      .filter((t) => t.severity === "blocker")
      .sort((a, b) => bySev[a.severity] - bySev[b.severity] || idleAge(b, now) - idleAge(a, now));
  }, [scopedOpen, now]);
  const idle3Sorted = useMemo(() => {
    const bySev = { blocker: 0, high: 1, medium: 2, low: 3 };
    return [...idleOpen].sort((a, b) => bySev[a.severity] - bySev[b.severity] || idleAge(b, now) - idleAge(a, now));
  }, [idleOpen, now]);
  const idle15Sorted = useMemo(() => {
    const bySev = { blocker: 0, high: 1, medium: 2, low: 3 };
    return [...idle15].sort((a, b) => bySev[a.severity] - bySev[b.severity] || idleAge(b, now) - idleAge(a, now));
  }, [idle15, now]);

  /** Point counts drive mobile chart min-width (horizontal scroll). */
  const chartPoints = useMemo(() => {
    const labelsFor = (bucket: TimeBucket, list: DashboardTicket[]) => {
      const set = new Set<string>();
      list.forEach((t) => {
        const lab = bucketLabel(t.createdDate, bucket);
        if (lab) set.add(lab);
      });
      return fillBucketRange([...set], bucket).length;
    };
    const solvedLabelsFor = (bucket: TimeBucket, list: DashboardTicket[]) => {
      const set = new Set<string>();
      list.forEach((t) => {
        const lab = bucketLabel(solvedDate(t), bucket);
        if (lab) set.add(lab);
      });
      return fillBucketRange([...set], bucket).length;
    };
    const hvSource = tickets.filter((t) => {
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      if (hvLevel && t.supportLevel !== hvLevel) return false;
      if (hvSev && t.severity !== hvSev) return false;
      return true;
    });
    const cvsSet = new Set<string>();
    createdScoped.forEach((t) => {
      const lab = bucketLabel(t.createdDate, cvsBucket);
      if (lab) cvsSet.add(lab);
    });
    solvedScoped.forEach((t) => {
      const lab = bucketLabel(solvedDate(t), cvsBucket);
      if (lab) cvsSet.add(lab);
    });
    const i15Filtered = idle15.filter((t) => !filter.severity || t.severity === filter.severity);
    return {
      created: labelsFor(createdBucket, createdScoped),
      createdSev: labelsFor(createdSevBucket, createdScoped),
      createdLvl: labelsFor(createdLvlBucket, createdScoped),
      createdHv: labelsFor(createdHvBucket, hvSource),
      solved: solvedLabelsFor(solvedBucket, solvedScoped),
      cvs: fillBucketRange([...cvsSet], cvsBucket).length,
      idle15: new Set(i15Filtered.map((t) => t.stageKey)).size,
    };
  }, [
    tickets,
    createdScoped,
    solvedScoped,
    idle15,
    filter.year,
    filter.severity,
    hvLevel,
    hvSev,
    createdBucket,
    createdSevBucket,
    createdLvlBucket,
    createdHvBucket,
    solvedBucket,
    cvsBucket,
  ]);

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

  function ticketsSolvedInBucket(
    list: DashboardTicket[],
    bucket: TimeBucket,
    label: string,
    extra?: (t: DashboardTicket) => boolean,
  ) {
    return list.filter((t) => inBucket(solvedDate(t), bucket, label) && (!extra || extra(t)));
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
    const solvedLabelsFor = (bucket: TimeBucket, list: DashboardTicket[]) => {
      const set = new Set<string>();
      list.forEach((t) => {
        const lab = bucketLabel(solvedDate(t), bucket);
        if (lab) set.add(lab);
      });
      return fillBucketRange([...set], bucket);
    };

    const createdLabels = labelsFor(createdBucket, createdScoped);
    const createdCounts = createdLabels.map((lab) => ticketsInBucket(createdScoped, createdBucket, lab).length);
    const createdPts = linePointStyle(createdLabels.length);
    mk("created", createdRef.current, {
      type: "line",
      data: {
        labels: displayLabels(createdLabels, createdBucket),
        datasets: [
          {
            label: "Tickets created",
            data: createdCounts,
            borderColor: C.blue,
            backgroundColor: "rgba(57,104,246,0.10)",
            fill: true,
            tension: 0.35,
            ...createdPts,
            pointBackgroundColor: C.blue,
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
          const lab = createdLabels[els[0].index];
          const bits = [`Created ${lab}`];
          if (filter.product) bits.push(productFilterLabel(filter.product, vendor.productLabels));
          openDrill(`${bits.join(" · ")} — tickets`, ticketsInBucket(createdScoped, createdBucket, lab));
        },
        plugins: {
          legend: { display: false },
          title: chartTitle(
            `${createdCounts.reduce((s, n) => s + n, 0).toLocaleString()} tickets created (${createdBucket}ly) · click a point to list all tickets`,
          ),
          valueLabels: { enabled: labelVisibility.created },
        },
        scales: { x: xScaleOptions(createdLabels.length), y: yScaleOptions() },
      },
    });

    const sevLabels = labelsFor(createdSevBucket, createdScoped);
    const sevPts = linePointStyle(sevLabels.length);
    mk("createdSev", createdSevRef.current, {
      type: "line",
      data: {
        labels: displayLabels(sevLabels, createdSevBucket),
        datasets: SEVERITIES.map((s) => ({
          label: s[0].toUpperCase() + s.slice(1),
          data: sevLabels.map((lab) => ticketsInBucket(createdScoped, createdSevBucket, lab, (t) => t.severity === s).length),
          borderColor: SEVLINECOL[s],
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...sevPts,
          pointBackgroundColor: SEVLINECOL[s],
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = sevLabels[els[0].index];
          const sev = SEVERITIES[els[0].datasetIndex];
          openDrill(
            `Created ${lab} · Severity: ${sev} — tickets`,
            ticketsInBucket(createdScoped, createdSevBucket, lab, (t) => t.severity === sev),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          valueLabels: { enabled: labelVisibility.createdSev },
        },
        scales: { x: xScaleOptions(sevLabels.length), y: yScaleOptions() },
      },
    });

    const lvlLabels = labelsFor(createdLvlBucket, createdScoped);
    const lvlPts = linePointStyle(lvlLabels.length);
    mk("createdLvl", createdLvlRef.current, {
      type: "line",
      data: {
        labels: displayLabels(lvlLabels, createdLvlBucket),
        datasets: SUPPORTLEVELS.map((l) => ({
          label: LVLLABEL[l] || l,
          data: lvlLabels.map((lab) => ticketsInBucket(createdScoped, createdLvlBucket, lab, (t) => t.supportLevel === l).length),
          borderColor: LVLLINECOL[l],
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...lvlPts,
          pointBackgroundColor: LVLLINECOL[l],
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = lvlLabels[els[0].index];
          const lvl = SUPPORTLEVELS[els[0].datasetIndex];
          openDrill(
            `Created ${lab} · Support level: ${LVLLABEL[lvl] || lvl} — tickets`,
            ticketsInBucket(createdScoped, createdLvlBucket, lab, (t) => t.supportLevel === lvl),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          valueLabels: { enabled: labelVisibility.createdLvl },
        },
        scales: { x: xScaleOptions(lvlLabels.length), y: yScaleOptions() },
      },
    });

    const hvSource = tickets.filter((t) => {
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      if (hvLevel && t.supportLevel !== hvLevel) return false;
      if (hvSev && t.severity !== hvSev) return false;
      return true;
    });
    const hvLabels = labelsFor(createdHvBucket, hvSource);
    const vendorsSeen = [...new Set([...HWVENDORS, ...hvSource.map((t) => t.hardwareVendor || "(none)")])];
    const hvOrder = HWVENDORS.filter((v) => vendorsSeen.includes(v)).concat(
      vendorsSeen.filter((v) => !HWVENDORS.includes(v)),
    );
    let tagged = 0;
    hvSource.forEach((t) => {
      if (t.hardwareVendor && t.hardwareVendor !== "(none)") tagged += 1;
    });
    const hvScopeTxt = [hvSev ? hvSev[0].toUpperCase() + hvSev.slice(1) : null, hvLevel ? LVLLABEL[hvLevel] || hvLevel : null]
      .filter(Boolean)
      .join(" · ");
    const hvScopePfx = hvScopeTxt ? `${hvScopeTxt} · ` : "";
    const hvPts = linePointStyle(hvLabels.length);
    mk("createdHv", createdHvRef.current, {
      type: "line",
      data: {
        labels: displayLabels(hvLabels, createdHvBucket),
        datasets: hvOrder.map((v) => ({
          label: v,
          data: hvLabels.map((lab) => ticketsInBucket(hvSource, createdHvBucket, lab, (t) => (t.hardwareVendor || "(none)") === v).length),
          borderColor: HVLINECOL[v] || C.grey,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...hvPts,
          pointBackgroundColor: HVLINECOL[v] || C.grey,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = hvLabels[els[0].index];
          const hv = hvOrder[els[0].datasetIndex];
          const bits = [`Created ${lab}`, `Vendor: ${hv}`];
          if (hvSev) bits.push(`Severity: ${hvSev}`);
          if (hvLevel) bits.push(`Support level: ${LVLLABEL[hvLevel] || hvLevel}`);
          openDrill(
            `${bits.join(" · ")} — tickets`,
            ticketsInBucket(hvSource, createdHvBucket, lab, (t) => (t.hardwareVendor || "(none)") === hv),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          title: chartTitle(
            `${tagged.toLocaleString()} tickets with a hardware vendor tagged (${hvScopePfx}${createdHvBucket}ly) · click a point to list them`,
          ),
          valueLabels: { enabled: labelVisibility.createdHv },
        },
        scales: { x: xScaleOptions(hvLabels.length), y: yScaleOptions() },
      },
    });

    const solvedLabels = solvedLabelsFor(solvedBucket, solvedScoped);
    const solvedCounts = solvedLabels.map((lab) => ticketsSolvedInBucket(solvedScoped, solvedBucket, lab).length);
    const solvedTotal = solvedCounts.reduce((s, n) => s + n, 0);
    const solvedPts = linePointStyle(solvedLabels.length);
    mk("solved", solvedRef.current, {
      type: "line",
      data: {
        labels: displayLabels(solvedLabels, solvedBucket),
        datasets: [
          {
            label: "Tickets solved",
            data: solvedCounts,
            borderColor: C.green,
            backgroundColor: "rgba(122,219,18,0.10)",
            fill: true,
            tension: 0.35,
            ...solvedPts,
            pointBackgroundColor: C.green,
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
          const lab = solvedLabels[els[0].index];
          const bits = [`Solved ${lab}`];
          if (filter.product) bits.push(productFilterLabel(filter.product, vendor.productLabels));
          openDrill(`${bits.join(" · ")} — tickets`, ticketsSolvedInBucket(solvedScoped, solvedBucket, lab));
        },
        plugins: {
          legend: { display: false },
          title: chartTitle(`${solvedTotal.toLocaleString()} tickets solved (${solvedBucket}ly) · click a point to list them`),
          valueLabels: { enabled: labelVisibility.solved },
        },
        scales: { x: xScaleOptions(solvedLabels.length), y: yScaleOptions() },
      },
    });

    const cvsLabels = fillBucketRange(
      [...new Set([...labelsFor(cvsBucket, createdScoped), ...solvedLabelsFor(cvsBucket, solvedScoped)])],
      cvsBucket,
    );
    const cvsCreatedCounts = cvsLabels.map((lab) => ticketsInBucket(createdScoped, cvsBucket, lab).length);
    const cvsSolvedCounts = cvsLabels.map((lab) => ticketsSolvedInBucket(solvedScoped, cvsBucket, lab).length);
    const cvsCreatedTotal = cvsCreatedCounts.reduce((s, n) => s + n, 0);
    const cvsSolvedTotal = cvsSolvedCounts.reduce((s, n) => s + n, 0);
    const net = cvsCreatedTotal - cvsSolvedTotal;
    const cvsPts = linePointStyle(cvsLabels.length);
    mk("cvs", cvsRef.current, {
      type: "line",
      data: {
        labels: displayLabels(cvsLabels, cvsBucket),
        datasets: [
          {
            label: "Created",
            data: cvsCreatedCounts,
            borderColor: C.blue,
            backgroundColor: "rgba(57,104,246,0.08)",
            fill: true,
            tension: 0.35,
            ...cvsPts,
            pointBackgroundColor: C.blue,
          },
          {
            label: "Solved",
            data: cvsSolvedCounts,
            borderColor: C.green,
            backgroundColor: "rgba(122,219,18,0.08)",
            fill: true,
            tension: 0.35,
            ...cvsPts,
            pointBackgroundColor: C.green,
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
          const lab = cvsLabels[els[0].index];
          if (els[0].datasetIndex === 1) {
            const bits = [`Solved ${lab}`];
            if (filter.product) bits.push(productFilterLabel(filter.product, vendor.productLabels));
            openDrill(`${bits.join(" · ")} — tickets`, ticketsSolvedInBucket(solvedScoped, cvsBucket, lab));
          } else {
            const bits = [`Created ${lab}`];
            if (filter.product) bits.push(productFilterLabel(filter.product, vendor.productLabels));
            openDrill(`${bits.join(" · ")} — tickets`, ticketsInBucket(createdScoped, cvsBucket, lab));
          }
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          title: chartTitle(
            `${cvsCreatedTotal.toLocaleString()} created · ${cvsSolvedTotal.toLocaleString()} solved · net ${net >= 0 ? "+" : ""}${net.toLocaleString()} (${cvsBucket}ly)`,
          ),
          valueLabels: { enabled: labelVisibility.cvs },
        },
        scales: { x: xScaleOptions(cvsLabels.length), y: yScaleOptions() },
      },
    });

    const i15Filtered = idle15.filter((t) => !filter.severity || t.severity === filter.severity);
    const i15Stages = [...new Set(i15Filtered.map((t) => t.stageKey))].sort((a, b) => {
      const A = i15Filtered.filter((t) => t.stageKey === a).length;
      const B = i15Filtered.filter((t) => t.stageKey === b).length;
      return B - A;
    });
    const sevList = (["blocker", "high", "medium", "low"] as const).filter((sv) => !filter.severity || sv === filter.severity);
    mk("idle15", idle15Ref.current, {
      type: "bar",
      data: {
        labels: i15Stages.map((st) => stageDisplay(st, i15Filtered.find((t) => t.stageKey === st)?.stageName || st)),
        datasets: sevList.map((sv) => ({
          label: sv[0].toUpperCase() + sv.slice(1),
          data: i15Stages.map((st) => i15Filtered.filter((t) => t.stageKey === st && t.severity === sv).length),
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
          const st = i15Stages[els[0].index];
          const sv = sevList[els[0].datasetIndex];
          openDrill(
            `Idle ${vendor.idle15Days}+ days · ${stageDisplay(st, "")} · ${sv}`,
            i15Filtered.filter((t) => t.stageKey === st && t.severity === sv),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          title: chartTitle(
            `${i15Filtered.length} open tickets idle ${vendor.idle15Days}+ days · click a bar to list them`,
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

    return () => {
      Object.values(charts.current).forEach((c) => c.destroy());
      charts.current = {};
    };
  }, [
    createdScoped,
    solvedScoped,
    tickets,
    filter,
    hvLevel,
    hvSev,
    createdBucket,
    createdSevBucket,
    createdLvlBucket,
    createdHvBucket,
    solvedBucket,
    cvsBucket,
    labelVisibility,
    idle15,
    vendor,
    now,
  ]);

  function toggleLabels(id: ChartId) {
    setLabelVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function persistSummary(text: string) {
    setSummary(text);
    try {
      localStorage.setItem(SUMMARY_KEY, text);
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
    a.download = "ebay-dashboard-summary.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    setSummaryStatus("Saved to file — check your downloads");
    window.setTimeout(() => setSummaryStatus(""), 1800);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="wrap flex min-h-14 flex-wrap items-center justify-between gap-3 py-2.5 sm:min-h-[60px] sm:py-0">
          <nav className="flex min-w-0 flex-wrap gap-1.5" aria-label="Vendors">
            {vendorList.map((v) => (
              <Link
                key={v.slug}
                href={`/${v.slug}`}
                className={`rounded-full border-[1.5px] px-3 py-1.5 font-mono-ui text-[11px] uppercase tracking-[0.05em] no-underline ${
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

      <section className="pb-1 pt-6 sm:pt-9">
        <div className="wrap">
          <h1 className="text-[28px] leading-[0.95] tracking-tight sm:text-4xl md:text-[44px]">
            Product support dashboard — {vendor.name}
          </h1>
          <p className="mt-2.5 max-w-[680px] text-sm text-muted sm:text-base">
            Ticket health for the {vendor.name} account. Filter by product, stage and severity — trends cover intake vs resolution,
            and idle tickets flag anything with no comment for {vendor.idleDays}+ days.
          </p>
        </div>
      </section>

      <div className="wrap pb-8">
        {error ? <div className="banner-box banner-box-error">{error}</div> : null}
        {!payload && loading ? <div className="banner-box">Loading live tickets from DevRev…</div> : null}

        <div className="mt-4 mb-2 flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5 sm:p-5">
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
            label="Account"
            value={vendor.name}
            disabled
            title={`This dashboard is scoped to ${vendor.name}`}
            options={[{ value: vendor.name, label: vendor.name }]}
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

        <div className="mb-3 mt-6 sm:mt-7">
          <h2 className="text-xl font-semibold sm:text-[26px]">Ticket creation trends</h2>
          <p className="mt-1 text-xs text-subtle sm:text-[13px]">
            All tickets created (not just open), by time bucket. Responds to the Product filter. Click a point to list all tickets
            created in that period (open &amp; solved).
          </p>
        </div>

        <ChartCard
          title="Tickets created"
          subtitle="Count of tickets by creation date."
          seg={<Seg value={createdBucket} onChange={setCreatedBucket} />}
          canvasRef={createdRef}
          tall
          points={chartPoints.created}
          showLabels={labelVisibility.created}
          onToggleLabels={() => toggleLabels("created")}
        />
        <ChartCard
          title="Tickets created by severity"
          subtitle="One line per severity · click a point to list all tickets (open &amp; solved)."
          seg={<Seg value={createdSevBucket} onChange={setCreatedSevBucket} />}
          canvasRef={createdSevRef}
          tall
          points={chartPoints.createdSev}
          showLabels={labelVisibility.createdSev}
          onToggleLabels={() => toggleLabels("createdSev")}
        />
        <ChartCard
          title="Tickets created by support level"
          subtitle='One line per support level (L1, L2, Vendor, L3 Internal). "(none)" = level not set · click a point to list tickets.'
          seg={<Seg value={createdLvlBucket} onChange={setCreatedLvlBucket} />}
          canvasRef={createdLvlRef}
          tall
          points={chartPoints.createdLvl}
          showLabels={labelVisibility.createdLvl}
          onToggleLabels={() => toggleLabels("createdLvl")}
        />

        <div className="card-panel mb-5 overflow-visible">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h3 className="card-title">Tickets created by hardware vendor</h3>
              <p className="mt-0.5 text-xs text-subtle">
                One line per hardware vendor. Filter by severity and support level. Account-wide for {vendor.name} — not
                product-filtered · click a point to list tickets.
              </p>
            </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
              <FieldSelect
                label="Severity"
                value={hvSev}
                onChange={setHvSev}
                options={[
                  { value: "", label: "All severities" },
                  { value: "blocker", label: "Blocker" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
              <FieldSelect
                label="Support level"
                value={hvLevel}
                onChange={setHvLevel}
                options={[
                  { value: "", label: "All levels" },
                  { value: "L1", label: "L1" },
                  { value: "L2", label: "L2" },
                  { value: "L3", label: "Vendor" },
                  { value: "L3 Internal", label: "L3 Internal" },
                  { value: "(none)", label: "(none)" },
                ]}
              />
              <div className="flex items-center gap-2">
                <LabelsToggle show={labelVisibility.createdHv} onToggle={() => toggleLabels("createdHv")} />
                <Seg value={createdHvBucket} onChange={setCreatedHvBucket} />
              </div>
            </div>
          </div>
          <ChartScrollFrame points={chartPoints.createdHv} tall>
            <canvas ref={createdHvRef} />
          </ChartScrollFrame>
        </div>

        <ChartCard
          title="Tickets solved"
          subtitle="Count of tickets that reached a Solved or Resolved stage, placed in the period they reached it. Responds to the Product filter · click a point to list the solved tickets."
          seg={<Seg value={solvedBucket} onChange={setSolvedBucket} />}
          canvasRef={solvedRef}
          tall
          points={chartPoints.solved}
          showLabels={labelVisibility.solved}
          onToggleLabels={() => toggleLabels("solved")}
        />
        <ChartCard
          title="Tickets created vs solved"
          subtitle="Intake vs resolution over time. Solved = tickets that reached a Solved/Resolved stage. Responds to the Product filter. A solved line above created means the backlog is shrinking."
          seg={<Seg value={cvsBucket} onChange={setCvsBucket} />}
          canvasRef={cvsRef}
          tall
          points={chartPoints.cvs}
          showLabels={labelVisibility.cvs}
          onToggleLabels={() => toggleLabels("cvs")}
        />

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

        <div className="card-panel mb-5 overflow-hidden">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="card-title">Open tickets with no activity in {vendor.idle15Days} days — by stage</h3>
              <p className="mt-0.5 text-xs text-subtle">
                Open tickets whose last customer/agent comment is {vendor.idle15Days}+ days old (or never commented), grouped by
                current stage.
              </p>
            </div>
            <LabelsToggle show={labelVisibility.idle15} onToggle={() => toggleLabels("idle15")} />
          </div>
          <ChartScrollFrame points={chartPoints.idle15}>
            <canvas ref={idle15Ref} />
          </ChartScrollFrame>
        </div>

        <div className="mb-3 mt-7">
          <h2 className="text-xl font-semibold sm:text-[26px]">Action lists</h2>
          <p className="mt-1 text-xs text-subtle sm:text-[13px]">
            Open tickets needing attention. Every row opens in DevRev. Lists respect the filters above.
          </p>
        </div>

        <ActionTable color={C.red} title="Blocked tickets" rows={blocked} now={now} vendor={vendor} />
        <ActionTable color={C.orange} title={`No update in ${vendor.idleDays}+ days`} rows={idle3Sorted} now={now} vendor={vendor} />
        <ActionTable
          color={C.dark}
          title={`Idle ${vendor.idle15Days}+ days (no activity)`}
          rows={idle15Sorted}
          now={now}
          vendor={vendor}
        />
      </div>

      <footer className="mt-8 bg-ink py-6 text-faint">
        <div className="wrap">
          <p className="font-mono-ui text-[10px] uppercase leading-relaxed tracking-[0.05em] sm:text-[11px]">
            {vendor.name} customer view · data refreshed {payload?.generatedAt ? new Date(payload.generatedAt).toUTCString() : "—"} ·
            products = ticket subtypes · idle = no comment {vendor.idleDays}+ days · click chart points for tickets
          </p>
        </div>
      </footer>
    </>
  );
}

function ChartCard({
  title,
  subtitle,
  seg,
  canvasRef,
  tall,
  points,
  showLabels,
  onToggleLabels,
}: {
  title: string;
  subtitle: string;
  seg: ReactNode;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  tall?: boolean;
  points: number;
  showLabels: boolean;
  onToggleLabels: () => void;
}) {
  return (
    <div className="card-panel mb-5 overflow-hidden">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="card-title">{title}</h3>
          <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LabelsToggle show={showLabels} onToggle={onToggleLabels} />
          {seg}
        </div>
      </div>
      <ChartScrollFrame points={points} tall={tall}>
        <canvas ref={canvasRef} />
      </ChartScrollFrame>
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
