"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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
import type { VendorConfig } from "@/config/vendors";
import type { DashboardTicket } from "@/lib/dashboard/types";
import { buildSoftSkuMatrix, copyFor } from "@/lib/dashboard/extras";
import { SKU_PALETTE } from "@/lib/dashboard/sku";
import {
  type DateRange,
  type RangePreset,
  autoGranularity,
  binDefs,
  formatRangeInfo,
  inDateRange,
  presetRange,
  ticketsInBin,
} from "@/lib/metrics/range";
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

const creationValueLabels: Plugin = {
  id: "creationValueLabels",
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
Chart.register(creationValueLabels);

type ChartId = "created" | "sku" | "sev" | "sevBar" | "lvl" | "hv" | "cvs";

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
  blocker: "#ff4570",
  high: "#ff893a",
  medium: "#3968f6",
  low: "#7adb12",
};

const SEVERITIES = ["blocker", "high", "medium", "low"] as const;

const LVLLABEL: Record<string, string> = {
  L1: "L1",
  L2: "L2",
  L3: "Vendor",
  "L3 Internal": "L3 Internal",
  "(none)": "(none)",
};

const HWVENDORS = [
  "Arista",
  "Aviz",
  "Celestica",
  "Cisco",
  "Dell",
  "Edgecore",
  "Nvidia",
  "Wistron",
  "Micas",
  "Supermicro",
  "UfiSpace",
  "Other",
  "(untagged)",
  "(none)",
];

const HVLINECOL: Record<string, string> = {
  Arista: C.red,
  Aviz: C.y,
  Celestica: C.purple,
  Cisco: C.blue,
  Dell: C.blueL,
  Edgecore: C.orange,
  Nvidia: C.green,
  Wistron: C.dark,
  Micas: "#22b8a6",
  Supermicro: "#e0620d",
  UfiSpace: "#f5b301",
  Other: C.grey,
  "(untagged)": "#b0b6bd",
  "(none)": C.grey,
};

const chartLayout = { padding: { top: 18, right: 10, bottom: 4, left: 2 } };

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "30", label: "30d" },
  { id: "90", label: "90d" },
  { id: "qtd", label: "This quarter" },
  { id: "ytd", label: "YTD" },
  { id: "all", label: "All" },
];

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

function yScaleOptions(opts?: { stacked?: boolean }) {
  return {
    beginAtZero: true,
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

function hvDisplayKey(raw: string): string {
  const v = raw || "(none)";
  return v === "(none)" ? "(untagged)" : v;
}

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

function ChartScrollFrame({ points, children }: { points: number; children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const minWidth = Math.max(points * 36, 280);

  useEffect(() => {
    const sync = () => setMobile(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !mobile) return;
    el.scrollLeft = el.scrollWidth;
  }, [points, minWidth, mobile]);

  return (
    <div ref={scrollerRef} className="chart-scroll">
      <div className="chart-box-tall" style={mobile ? { minWidth } : undefined}>
        {children}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  canvasRef,
  points,
  showLabels,
  onToggleLabels,
  extra,
}: {
  title: string;
  subtitle: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  points: number;
  showLabels: boolean;
  onToggleLabels: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="card-panel mb-3 overflow-hidden sm:mb-5">
      <div className="mb-3 flex flex-col gap-2.5 sm:mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className="card-title">{title}</h3>
          <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LabelsToggle show={showLabels} onToggle={onToggleLabels} />
          {extra}
        </div>
      </div>
      <ChartScrollFrame points={points}>
        <canvas ref={canvasRef} />
      </ChartScrollFrame>
    </div>
  );
}

function SoftSkuMatrix({
  matrix,
  onCellClick,
}: {
  matrix: ReturnType<typeof buildSoftSkuMatrix>;
  onCellClick: (sku: string | null, soft: string | null) => void;
}) {
  const { skus, softwares, cells, rowTot, colTot, grand } = matrix;
  const maxCell = Math.max(1, ...skus.flatMap((sku) => softwares.map((s) => cells[sku]?.[s]?.length || 0)));

  if (!skus.length) {
    return <div className="px-1 py-3 text-sm text-subtle">No tickets in this selection.</div>;
  }

  return (
    <div className="wl-scroll -mx-1 max-w-full">
      <table className="wl-table">
          <thead>
            <tr>
              <th>Model / SKU</th>
              {softwares.map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((sku) => (
              <tr key={sku}>
                <td>{sku}</td>
                {softwares.map((soft) => {
                  const v = cells[sku]?.[soft]?.length || 0;
                  if (!v) {
                    return (
                      <td key={soft} className="wl-zero">
                        ·
                      </td>
                    );
                  }
                  const tint = 0.06 + 0.32 * (v / maxCell);
                  return (
                    <td
                      key={soft}
                      className="wl-click"
                      style={{ background: `rgba(57,104,246,${tint.toFixed(3)})` }}
                      onClick={() => onCellClick(sku, soft)}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="wl-click" onClick={() => onCellClick(sku, null)}>
                  {rowTot[sku] || 0}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>All SKUs</td>
              {softwares.map((s) => (
                <td key={s} className="wl-click" onClick={() => onCellClick(null, s)}>
                  {colTot[s] || 0}
                </td>
              ))}
              <td>{grand}</td>
            </tr>
          </tfoot>
        </table>
    </div>
  );
}

export function CreationTrends({
  vendor,
  tickets,
  hvTickets,
  copy,
  openDrill,
  todayIso,
  range,
  preset,
  onRangeChange,
  onPresetChange,
}: {
  vendor: VendorConfig;
  tickets: DashboardTicket[];
  hvTickets: DashboardTicket[];
  copy: ReturnType<typeof copyFor>;
  openDrill: (title: string, tickets: DashboardTicket[]) => void;
  todayIso: string;
  range: DateRange;
  preset: RangePreset | null;
  onRangeChange: (range: DateRange) => void;
  onPresetChange: (preset: RangePreset | null) => void;
}) {
  const [hvLevel, setHvLevel] = useState("L3");
  const [hvSev, setHvSev] = useState("");
  const [labels, setLabels] = useState<Record<ChartId, boolean>>({
    created: true,
    sku: true,
    sev: true,
    sevBar: true,
    lvl: true,
    hv: true,
    cvs: true,
  });

  const charts = useRef<Record<string, ChartType>>({});
  const createdRef = useRef<HTMLCanvasElement>(null);
  const skuRef = useRef<HTMLCanvasElement>(null);
  const sevRef = useRef<HTMLCanvasElement>(null);
  const sevBarRef = useRef<HTMLCanvasElement>(null);
  const lvlRef = useRef<HTMLCanvasElement>(null);
  const hvRef = useRef<HTMLCanvasElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);

  const gran = useMemo(() => autoGranularity(range, "month"), [range]);
  const rangeInfo = useMemo(() => formatRangeInfo(range, gran), [range, gran]);

  const createdDates = useMemo(() => tickets.map((t) => t.createdDate), [tickets]);
  const bins = useMemo(
    () => binDefs(range, gran, createdDates, todayIso),
    [range, gran, createdDates, todayIso],
  );
  const labelsAxis = useMemo(() => bins.map((b) => b.label), [bins]);

  const rangedTickets = useMemo(
    () => tickets.filter((t) => inDateRange(t.createdDate, range)),
    [tickets, range],
  );

  const softMatrix = useMemo(() => buildSoftSkuMatrix(rangedTickets), [rangedTickets]);

  const hvSource = useMemo(
    () =>
      hvTickets.filter((t) => {
        if (!inDateRange(t.createdDate, range)) return false;
        if (hvLevel && t.supportLevel !== hvLevel) return false;
        if (hvSev && t.severity !== hvSev) return false;
        return true;
      }),
    [hvTickets, range, hvLevel, hvSev],
  );

  function mk(id: string, canvas: HTMLCanvasElement | null, cfg: unknown) {
    if (!canvas) return;
    charts.current[id]?.destroy();
    charts.current[id] = new Chart(canvas, cfg as ChartConfiguration);
  }

  function toggleLabels(id: ChartId) {
    setLabels((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function applyPreset(p: RangePreset) {
    onPresetChange(p);
    onRangeChange(presetRange(p, todayIso));
  }

  function onManualFrom(v: string) {
    onPresetChange(null);
    onRangeChange({ from: v || null, to: range.to });
  }

  function onManualTo(v: string) {
    onPresetChange(null);
    onRangeChange({ from: range.from, to: v || null });
  }

  useEffect(() => {
    const pts = linePointStyle(bins.length);

    // 1. Tickets created
    const createdCounts = bins.map((b) => ticketsInBin(tickets, b).length);
    const createdTotal = createdCounts.reduce((s, n) => s + n, 0);
    mk("created", createdRef.current, {
      type: "line",
      data: {
        labels: labelsAxis,
        datasets: [
          {
            label: "Tickets created",
            data: createdCounts,
            borderColor: C.blue,
            backgroundColor: "rgba(57,104,246,0.10)",
            fill: true,
            tension: 0.35,
            ...pts,
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
          const bin = bins[els[0].index];
          openDrill(`Created ${bin.label} — tickets`, ticketsInBin(tickets, bin));
        },
        plugins: {
          legend: { display: false },
          title: chartTitle(
            `${createdTotal.toLocaleString()} tickets created (${gran}ly) · click a point to list all tickets`,
          ),
          valueLabels: { enabled: labels.created },
        },
        scales: { x: xScaleOptions(bins.length), y: yScaleOptions() },
      },
    });

    // 2. By model / SKU
    const skuTot: Record<string, number> = {};
    rangedTickets.forEach((t) => {
      const k = t.modelSku || "(unspecified)";
      skuTot[k] = (skuTot[k] || 0) + 1;
    });
    let skus = Object.keys(skuTot)
      .filter((k) => skuTot[k] > 0)
      .sort((a, b) => skuTot[b] - skuTot[a] || a.localeCompare(b));
    if (skus.length > 10) skus = skus.slice(0, 10);
    mk("sku", skuRef.current, {
      type: "line",
      data: {
        labels: labelsAxis,
        datasets: skus.map((sku, i) => {
          const col = SKU_PALETTE[i % SKU_PALETTE.length];
          return {
            label: sku,
            data: bins.map(
              (b) => ticketsInBin(tickets, b, (t) => t.createdDate).filter((t) => (t.modelSku || "(unspecified)") === sku).length,
            ),
            borderColor: col,
            backgroundColor: "transparent",
            fill: false,
            tension: 0.35,
            ...pts,
            pointBackgroundColor: col,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const bin = bins[els[0].index];
          const sku = skus[els[0].datasetIndex];
          openDrill(
            `SKU ${sku} · ${bin.label} — tickets`,
            ticketsInBin(tickets, bin).filter((t) => (t.modelSku || "(unspecified)") === sku),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          valueLabels: { enabled: labels.sku },
        },
        scales: { x: xScaleOptions(bins.length), y: yScaleOptions() },
      },
    });

    // 4 + 5. Severity line + stacked bar
    const sevDatasetsLine = SEVERITIES.map((s) => ({
      label: s[0].toUpperCase() + s.slice(1),
      data: bins.map((b) => ticketsInBin(tickets, b).filter((t) => t.severity === s).length),
      borderColor: SEVCOL[s],
      backgroundColor: "transparent",
      fill: false,
      tension: 0.35,
      ...pts,
      pointBackgroundColor: SEVCOL[s],
    }));
    const drillSev = (els: ActiveElement[]) => {
      if (!els.length) return;
      const bin = bins[els[0].index];
      const sev = SEVERITIES[els[0].datasetIndex];
      openDrill(
        `Created ${bin.label} · Severity: ${sev} — tickets`,
        ticketsInBin(tickets, bin).filter((t) => t.severity === sev),
      );
    };
    mk("sev", sevRef.current, {
      type: "line",
      data: { labels: labelsAxis, datasets: sevDatasetsLine },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => drillSev(els),
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          valueLabels: { enabled: labels.sev },
        },
        scales: { x: xScaleOptions(bins.length), y: yScaleOptions() },
      },
    });
    mk("sevBar", sevBarRef.current, {
      type: "bar",
      data: {
        labels: labelsAxis,
        datasets: SEVERITIES.map((s) => ({
          label: s[0].toUpperCase() + s.slice(1),
          data: bins.map((b) => ticketsInBin(tickets, b).filter((t) => t.severity === s).length),
          backgroundColor: SEVCOL[s],
          borderWidth: 0,
          stack: "sev",
          maxBarThickness: 48,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        onClick: (_e: unknown, els: ActiveElement[]) => drillSev(els),
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          valueLabels: { enabled: labels.sevBar },
        },
        scales: {
          x: { stacked: true, ...xScaleOptions(bins.length) },
          y: { stacked: true, ...yScaleOptions({ stacked: true }) },
        },
      },
    });

    // 6. Aviz vs Vendor
    let lvlDatasets: {
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
      pointHoverRadius: number;
      borderWidth: number;
      pointBackgroundColor: string;
    }[] = [];
    let lvlClick: (els: ActiveElement[]) => void = () => undefined;

    if (vendor.supportLevelChart === "ebay-split") {
      const known = new Set(HWVENDORS.filter((v) => v !== "(untagged)" && v !== "(none)" && v !== "Other"));
      const hvOf = (t: DashboardTicket) => {
        const v = t.hardwareVendor || "(none)";
        if (v === "(none)") return "(untagged)";
        return known.has(v) ? v : "Other";
      };
      const l3Tickets = tickets.filter((t) => t.supportLevel === "L3");
      const vendorTot: Record<string, number> = {};
      l3Tickets.forEach((t) => {
        if (!inDateRange(t.createdDate, range)) return;
        const v = hvOf(t);
        vendorTot[v] = (vendorTot[v] || 0) + 1;
      });
      const vendorsOrdered = Object.keys(vendorTot).sort((a, b) => vendorTot[b] - vendorTot[a] || a.localeCompare(b));
      lvlDatasets = [
        {
          label: "Aviz (non-L3)",
          data: bins.map((b) => ticketsInBin(tickets, b).filter((t) => t.supportLevel !== "L3").length),
          borderColor: C.blue,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...pts,
          pointBackgroundColor: C.blue,
        },
        ...vendorsOrdered.map((v) => ({
          label: `Vendor: ${v === "(none)" ? "untagged" : v}`,
          data: bins.map(
            (b) => ticketsInBin(tickets, b).filter((t) => t.supportLevel === "L3" && hvOf(t) === v).length,
          ),
          borderColor: HVLINECOL[v] || C.grey,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...pts,
          pointBackgroundColor: HVLINECOL[v] || C.grey,
        })),
      ];
      lvlClick = (els) => {
        if (!els.length) return;
        const bin = bins[els[0].index];
        const di = els[0].datasetIndex;
        if (di === 0) {
          openDrill(
            `Created ${bin.label} · Aviz (L1/L2/L3 Internal) — tickets`,
            ticketsInBin(tickets, bin).filter((t) => t.supportLevel !== "L3"),
          );
        } else {
          const v = vendorsOrdered[di - 1];
          openDrill(
            `Created ${bin.label} · Vendor (L3) · ${v === "(none)" ? "untagged" : v} — tickets`,
            ticketsInBin(tickets, bin).filter((t) => t.supportLevel === "L3" && hvOf(t) === v),
          );
        }
      };
    } else {
      lvlDatasets = [
        {
          label: "Vendor",
          data: bins.map((b) => ticketsInBin(tickets, b).filter((t) => t.supportLevel === "L3").length),
          borderColor: C.orange,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...pts,
          pointBackgroundColor: C.orange,
        },
        {
          label: "Aviz",
          data: bins.map((b) => ticketsInBin(tickets, b).filter((t) => t.supportLevel !== "L3").length),
          borderColor: C.blue,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          ...pts,
          pointBackgroundColor: C.blue,
        },
      ];
      lvlClick = (els) => {
        if (!els.length) return;
        const bin = bins[els[0].index];
        if (els[0].datasetIndex === 0) {
          openDrill(
            `Created ${bin.label} · Vendor (L3) — tickets`,
            ticketsInBin(tickets, bin).filter((t) => t.supportLevel === "L3"),
          );
        } else {
          openDrill(
            `Created ${bin.label} · Aviz (non-L3) — tickets`,
            ticketsInBin(tickets, bin).filter((t) => t.supportLevel !== "L3"),
          );
        }
      };
    }

    mk("lvl", lvlRef.current, {
      type: "line",
      data: { labels: labelsAxis, datasets: lvlDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: chartLayout,
        interaction: { mode: "index", intersect: false },
        onClick: (_e: unknown, els: ActiveElement[]) => lvlClick(els),
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          valueLabels: { enabled: labels.lvl },
        },
        scales: { x: xScaleOptions(bins.length), y: yScaleOptions() },
      },
    });

    // 7. Hardware vendor
    const hvDates = hvSource.map((t) => t.createdDate);
    const hvBins = binDefs(range, gran, hvDates.length ? hvDates : createdDates, todayIso);
    const hvLabels = hvBins.map((b) => b.label);
    const hvPts = linePointStyle(hvBins.length);
    const vendorsSeen = [
      ...new Set([...HWVENDORS, ...hvSource.map((t) => hvDisplayKey(t.hardwareVendor))]),
    ];
    const hvOrder = HWVENDORS.filter((v) => vendorsSeen.includes(v) && hvSource.some((t) => hvDisplayKey(t.hardwareVendor) === v)).concat(
      vendorsSeen.filter(
        (v) => !HWVENDORS.includes(v) && hvSource.some((t) => hvDisplayKey(t.hardwareVendor) === v),
      ),
    );
    let tagged = 0;
    hvSource.forEach((t) => {
      const v = hvDisplayKey(t.hardwareVendor);
      if (v !== "(untagged)" && v !== "(none)") tagged += 1;
    });
    const hvScopeTxt = [hvSev ? hvSev[0].toUpperCase() + hvSev.slice(1) : null, hvLevel ? LVLLABEL[hvLevel] || hvLevel : null]
      .filter(Boolean)
      .join(" · ");
    const hvScopePfx = hvScopeTxt ? `${hvScopeTxt} · ` : "";
    mk("hv", hvRef.current, {
      type: "line",
      data: {
        labels: hvLabels,
        datasets: hvOrder.map((v) => ({
          label: v,
          data: hvBins.map(
            (b) => ticketsInBin(hvSource, b).filter((t) => hvDisplayKey(t.hardwareVendor) === v).length,
          ),
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
          const bin = hvBins[els[0].index];
          const hv = hvOrder[els[0].datasetIndex];
          const bits = [`Created ${bin.label}`, `Vendor: ${hv}`];
          if (hvSev) bits.push(`Severity: ${hvSev}`);
          if (hvLevel) bits.push(`Support level: ${LVLLABEL[hvLevel] || hvLevel}`);
          openDrill(
            `${bits.join(" · ")} — tickets`,
            ticketsInBin(hvSource, bin).filter((t) => hvDisplayKey(t.hardwareVendor) === hv),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          title: chartTitle(
            `${tagged.toLocaleString()} tickets with a hardware vendor tagged (${hvScopePfx}${gran}ly) · click a point to list them`,
          ),
          valueLabels: { enabled: labels.hv },
        },
        scales: { x: xScaleOptions(hvBins.length), y: yScaleOptions() },
      },
    });

    // 8. Created vs solved
    const solvedOf = (t: DashboardTicket) => (t.isSolvedStage ? t.actualCloseDate : null);
    const cvsCreated = bins.map((b) => ticketsInBin(tickets, b).length);
    const cvsSolved = bins.map((b) => ticketsInBin(tickets, b, solvedOf).length);
    const cvsCreatedTotal = cvsCreated.reduce((s, n) => s + n, 0);
    const cvsSolvedTotal = cvsSolved.reduce((s, n) => s + n, 0);
    const net = cvsCreatedTotal - cvsSolvedTotal;
    mk("cvs", cvsRef.current, {
      type: "line",
      data: {
        labels: labelsAxis,
        datasets: [
          {
            label: "Created",
            data: cvsCreated,
            borderColor: C.blue,
            backgroundColor: "rgba(57,104,246,0.08)",
            fill: true,
            tension: 0.35,
            ...pts,
            pointBackgroundColor: C.blue,
          },
          {
            label: "Solved",
            data: cvsSolved,
            borderColor: C.green,
            backgroundColor: "rgba(122,219,18,0.08)",
            fill: true,
            tension: 0.35,
            ...pts,
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
          const bin = bins[els[0].index];
          if (els[0].datasetIndex === 1) {
            openDrill(`Solved ${bin.label} — tickets`, ticketsInBin(tickets, bin, solvedOf));
          } else {
            openDrill(`Created ${bin.label} — tickets`, ticketsInBin(tickets, bin));
          }
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
          title: chartTitle(
            `${cvsCreatedTotal.toLocaleString()} created · ${cvsSolvedTotal.toLocaleString()} solved · net ${net >= 0 ? "+" : ""}${net.toLocaleString()} (${gran}ly)`,
          ),
          valueLabels: { enabled: labels.cvs },
        },
        scales: { x: xScaleOptions(bins.length), y: yScaleOptions() },
      },
    });

    return () => {
      Object.values(charts.current).forEach((c) => c.destroy());
      charts.current = {};
    };
  }, [
    bins,
    labelsAxis,
    tickets,
    rangedTickets,
    hvSource,
    gran,
    range,
    labels,
    vendor,
    hvSev,
    hvLevel,
    openDrill,
    todayIso,
    createdDates,
  ]);

  return (
    <>
      <div className="mb-2 mt-4 sm:mb-3 sm:mt-7">
        <h2 className="text-base font-semibold sm:text-[26px]">Ticket creation trends</h2>
        <p className="mt-1 hidden text-xs text-subtle sm:block sm:text-[13px]">
          All tickets created (not just open), by time bucket. Responds to the Product filter. Click a point to list all tickets
          created in that period (open &amp; solved).
        </p>
      </div>

      <div className="card-panel mb-3 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
        <span className="eyebrow">Time range</span>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-subtle sm:flex-none sm:text-[13px]">
          From
          <input
            type="date"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 text-base text-ink sm:min-h-0 sm:flex-none sm:py-1.5 sm:text-sm"
            value={range.from || ""}
            onChange={(e) => onManualFrom(e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-subtle sm:flex-none sm:text-[13px]">
          To
          <input
            type="date"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 text-base text-ink sm:min-h-0 sm:flex-none sm:py-1.5 sm:text-sm"
            value={range.to || ""}
            onChange={(e) => onManualTo(e.target.value)}
          />
        </label>
        <div className="seg">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={preset === p.id ? "on" : ""}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="w-full text-xs text-subtle sm:ml-auto sm:w-auto sm:text-[12px]">{rangeInfo}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-5 lg:grid-cols-2">
        <ChartCard
          title="Tickets created"
          subtitle="Count of tickets by creation date."
          canvasRef={createdRef}
          points={bins.length}
          showLabels={labels.created}
          onToggleLabels={() => toggleLabels("created")}
        />
        <ChartCard
          title="Tickets created by model / SKU"
          subtitle={copy.sku}
          canvasRef={skuRef}
          points={bins.length}
          showLabels={labels.sku}
          onToggleLabels={() => toggleLabels("sku")}
        />
      </div>

      <div className="mb-2 mt-4 sm:mb-3 sm:mt-7">
        <h2 className="text-base font-semibold sm:text-[26px]">Created tickets by software &amp; model/SKU</h2>
        <p className="mt-1 hidden text-xs text-subtle sm:block sm:text-[13px]">
          Created tickets grouped by hardware model/SKU and software. Follows the time range · click a cell to list those tickets.
        </p>
      </div>

      <div className="card-panel mb-3 sm:mb-5">
        <div className="mb-4 min-w-0">
          <h3 className="card-title">Software &amp; model/SKU</h3>
          <p className="mt-0.5 text-xs text-subtle">{copy.softSku}</p>
        </div>
        <SoftSkuMatrix
          matrix={softMatrix}
          onCellClick={(sku, soft) => {
            if (sku && soft) {
              openDrill(`SKU ${sku} · ${soft} — tickets`, softMatrix.cells[sku]?.[soft] || []);
            } else if (sku) {
              const rows = softwaresFlat(softMatrix, sku, null);
              openDrill(`SKU ${sku} · all software — tickets`, rows);
            } else if (soft) {
              const rows = softwaresFlat(softMatrix, null, soft);
              openDrill(`Software ${soft} · all SKUs — tickets`, rows);
            }
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-5 lg:grid-cols-2">
        <ChartCard
          title="Tickets created by severity"
          subtitle="One line per severity · click a point to list all tickets (open &amp; solved)."
          canvasRef={sevRef}
          points={bins.length}
          showLabels={labels.sev}
          onToggleLabels={() => toggleLabels("sev")}
        />
        <ChartCard
          title="Severity mix per period"
          subtitle="Stacked bars of the same data · click a segment to list that period's tickets at that severity."
          canvasRef={sevBarRef}
          points={bins.length}
          showLabels={labels.sevBar}
          onToggleLabels={() => toggleLabels("sevBar")}
        />
      </div>

      <ChartCard
        title="Ticket distributed by Aviz vs Vendor"
        subtitle={copy.createdLvl}
        canvasRef={lvlRef}
        points={bins.length}
        showLabels={labels.lvl}
        onToggleLabels={() => toggleLabels("lvl")}
      />

      <div className="card-panel mb-3 overflow-hidden sm:mb-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h3 className="card-title">Tickets created to hardware vendor</h3>
            <p className="mt-0.5 text-xs text-subtle">{copy.createdHv}</p>
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
            <LabelsToggle show={labels.hv} onToggle={() => toggleLabels("hv")} />
          </div>
        </div>
        <ChartScrollFrame points={bins.length}>
          <canvas ref={hvRef} />
        </ChartScrollFrame>
      </div>

      <ChartCard
        title="Tickets created vs solved"
        subtitle={copy.cvs}
        canvasRef={cvsRef}
        points={bins.length}
        showLabels={labels.cvs}
        onToggleLabels={() => toggleLabels("cvs")}
      />
    </>
  );
}

function softwaresFlat(
  matrix: ReturnType<typeof buildSoftSkuMatrix>,
  sku: string | null,
  soft: string | null,
): DashboardTicket[] {
  if (sku && !soft) {
    return matrix.softwares.flatMap((s) => matrix.cells[sku]?.[s] || []);
  }
  if (!sku && soft) {
    return matrix.skus.flatMap((sk) => matrix.cells[sk]?.[soft] || []);
  }
  return [];
}
