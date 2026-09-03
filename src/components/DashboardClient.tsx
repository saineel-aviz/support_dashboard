"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { bucketLabel, inBucket } from "@/lib/metrics/buckets";
import { daysSince } from "@/lib/metrics/sprints";

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
Chart.defaults.layout.padding = { top: 14, right: 10 };

const valueLabels: Plugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const type = (chart.config as { type?: string }).type;
    ctx.save();
    ctx.font = "700 11px ui-monospace, monospace";
    chart.data.datasets.forEach((_ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = chart.data.datasets[di].data[i];
        if (v === null || v === undefined || v === 0) return;
        if (type === "line") {
          ctx.fillStyle = "#302e2f";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(String(v), el.x, el.y - 6);
        } else {
          const horizontal = chart.options.indexAxis === "y";
          ctx.fillStyle = "#302e2f";
          if (horizontal) {
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(v), el.x + 5, el.y);
          } else {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(String(v), el.x, el.y - 4);
          }
        }
      });
    });
    ctx.restore();
  },
};
Chart.register(valueLabels);

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
const grid = "rgba(0,0,0,0.06)";
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
  const [hvLevel, setHvLevel] = useState("");
  const [createdBucket, setCreatedBucket] = useState<TimeBucket>("month");
  const [createdSevBucket, setCreatedSevBucket] = useState<TimeBucket>("month");
  const [createdLvlBucket, setCreatedLvlBucket] = useState<TimeBucket>("month");
  const [createdHvBucket, setCreatedHvBucket] = useState<TimeBucket>("month");
  const [drill, setDrill] = useState<{ title: string; tickets: DashboardTicket[] } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [summary, setSummary] = useState("");
  const [summaryStatus, setSummaryStatus] = useState("");

  const charts = useRef<Record<string, ChartType>>({});
  const createdRef = useRef<HTMLCanvasElement>(null);
  const createdSevRef = useRef<HTMLCanvasElement>(null);
  const createdLvlRef = useRef<HTMLCanvasElement>(null);
  const createdHvRef = useRef<HTMLCanvasElement>(null);
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
      if (filter.product && t.product !== filter.product) return false;
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
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

  const scopeText = [
    filter.year || "All years",
    filter.product ? productLabel(filter.product, vendor.productLabels) : "All products",
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
      return [...set].sort();
    };

    const createdLabels = labelsFor(createdBucket, createdScoped);
    const createdCounts = createdLabels.map((lab) => ticketsInBucket(createdScoped, createdBucket, lab).length);
    mk("created", createdRef.current, {
      type: "line",
      data: {
        labels: createdLabels,
        datasets: [
          {
            label: "Tickets created",
            data: createdCounts,
            borderColor: C.blue,
            backgroundColor: "rgba(57,104,246,0.10)",
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: C.blue,
          },
        ],
      },
      options: {
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = createdLabels[els[0].index];
          const bits = [`Created ${lab}`];
          if (filter.product) bits.push(productLabel(filter.product, vendor.productLabels));
          openDrill(`${bits.join(" · ")} — tickets`, ticketsInBucket(createdScoped, createdBucket, lab));
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `${createdCounts.reduce((s, n) => s + n, 0).toLocaleString()} tickets created (${createdBucket}ly) · click a point to list all tickets`,
            font: { size: 13, weight: "normal" },
            color: "#7a7579",
            padding: { bottom: 8 },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 60 } },
          y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } },
        },
      },
    });

    const sevLabels = labelsFor(createdSevBucket, createdScoped);
    mk("createdSev", createdSevRef.current, {
      type: "line",
      data: {
        labels: sevLabels,
        datasets: SEVERITIES.map((s) => ({
          label: s[0].toUpperCase() + s.slice(1),
          data: sevLabels.map((lab) => ticketsInBucket(createdScoped, createdSevBucket, lab, (t) => t.severity === s).length),
          borderColor: SEVLINECOL[s],
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: SEVLINECOL[s],
        })),
      },
      options: {
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = sevLabels[els[0].index];
          const sev = SEVERITIES[els[0].datasetIndex];
          openDrill(
            `Created ${lab} · Severity: ${sev} — tickets`,
            ticketsInBucket(createdScoped, createdSevBucket, lab, (t) => t.severity === sev),
          );
        },
        plugins: { legend: { position: "top", labels: { boxWidth: 12, boxHeight: 12, padding: 12 } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 60 } },
          y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } },
        },
      },
    });

    const lvlLabels = labelsFor(createdLvlBucket, createdScoped);
    mk("createdLvl", createdLvlRef.current, {
      type: "line",
      data: {
        labels: lvlLabels,
        datasets: SUPPORTLEVELS.map((l) => ({
          label: LVLLABEL[l] || l,
          data: lvlLabels.map((lab) => ticketsInBucket(createdScoped, createdLvlBucket, lab, (t) => t.supportLevel === l).length),
          borderColor: LVLLINECOL[l],
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: LVLLINECOL[l],
        })),
      },
      options: {
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = lvlLabels[els[0].index];
          const lvl = SUPPORTLEVELS[els[0].datasetIndex];
          openDrill(
            `Created ${lab} · Support level: ${LVLLABEL[lvl] || lvl} — tickets`,
            ticketsInBucket(createdScoped, createdLvlBucket, lab, (t) => t.supportLevel === lvl),
          );
        },
        plugins: { legend: { position: "top", labels: { boxWidth: 12, boxHeight: 12, padding: 12 } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 60 } },
          y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } },
        },
      },
    });

    const hvSource = tickets.filter((t) => {
      if (filter.year) {
        const y = t.createdDate ? new Date(t.createdDate).getUTCFullYear() : null;
        if (y !== parseInt(filter.year, 10)) return false;
      }
      if (hvLevel && t.supportLevel !== hvLevel) return false;
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
    mk("createdHv", createdHvRef.current, {
      type: "line",
      data: {
        labels: hvLabels,
        datasets: hvOrder.map((v) => ({
          label: v,
          data: hvLabels.map((lab) => ticketsInBucket(hvSource, createdHvBucket, lab, (t) => (t.hardwareVendor || "(none)") === v).length),
          borderColor: HVLINECOL[v] || C.grey,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: HVLINECOL[v] || C.grey,
        })),
      },
      options: {
        onClick: (_e: unknown, els: ActiveElement[]) => {
          if (!els.length) return;
          const lab = hvLabels[els[0].index];
          const hv = hvOrder[els[0].datasetIndex];
          const bits = [`Created ${lab}`, `Vendor: ${hv}`];
          if (hvLevel) bits.push(`Support level: ${LVLLABEL[hvLevel] || hvLevel}`);
          openDrill(
            `${bits.join(" · ")} — tickets`,
            ticketsInBucket(hvSource, createdHvBucket, lab, (t) => (t.hardwareVendor || "(none)") === hv),
          );
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
          title: {
            display: true,
            text: `${tagged.toLocaleString()} tickets with a hardware vendor tagged (${hvLevel ? `${LVLLABEL[hvLevel] || hvLevel} · ` : ""}${createdHvBucket}ly) · click a point to list them`,
            font: { size: 13, weight: "normal" },
            color: "#7a7579",
            padding: { bottom: 8 },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 60 } },
          y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } },
        },
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
          maxBarThickness: 64,
        })),
      },
      options: {
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
          legend: { position: "top", labels: { boxWidth: 12, boxHeight: 12, padding: 14 } },
          title: {
            display: true,
            text: `${i15Filtered.length} open tickets idle ${vendor.idle15Days}+ days · click a bar to list them`,
            font: { size: 13, weight: "normal" },
            color: "#7a7579",
            padding: { bottom: 8 },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { display: false } },
          y: { stacked: true, beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { precision: 0 } },
        },
      },
    });

    return () => {
      Object.values(charts.current).forEach((c) => c.destroy());
      charts.current = {};
    };
  }, [
    createdScoped,
    tickets,
    filter,
    hvLevel,
    createdBucket,
    createdSevBucket,
    createdLvlBucket,
    createdHvBucket,
    idle15,
    vendor,
    now,
  ]);

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
      <header>
        <div className="wrap bar">
          <div className="bar-left">
            <nav className="vendor-nav" aria-label="Vendors">
              {vendorList.map((v) => (
                <Link key={v.slug} href={`/${v.slug}`} className={v.slug === vendor.slug ? "active" : ""}>
                  {v.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="bar-right">
            <span className="eyebrow">Product support · {vendor.name} (customer view)</span>
            <button className="refresh-btn" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              <svg className={loading ? "spin" : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.4-6.1" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <h1>Product support dashboard — {vendor.name}</h1>
          <p>
            Ticket health for the {vendor.name} account. Filter by product, stage and severity — trends cover intake vs resolution,
            and idle tickets flag anything with no comment for {vendor.idleDays}+ days.
          </p>
        </div>
      </section>

      <div className="wrap">
        {error ? <div className="banner error">{error}</div> : null}
        {!payload && loading ? <div className="banner">Loading live tickets from DevRev…</div> : null}

        <div className="filters">
          <div className="fg">
            <label>Year</label>
            <select value={filter.year} onChange={(e) => setFilter((f) => ({ ...f, year: e.target.value }))}>
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label>Product</label>
            <select value={filter.product} onChange={(e) => setFilter((f) => ({ ...f, product: e.target.value }))}>
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p || "untyped"} value={p}>
                  {productLabel(p, vendor.productLabels)}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label>Account</label>
            <select disabled title={`This dashboard is scoped to ${vendor.name}`}>
              <option>{vendor.name}</option>
            </select>
          </div>
          <div className="fg">
            <label>Stage</label>
            <select value={filter.stage} onChange={(e) => setFilter((f) => ({ ...f, stage: e.target.value }))}>
              <option value="">All stages</option>
              {stages.map(([k, name]) => (
                <option key={k} value={k}>
                  {stageDisplay(k, name)}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label>Severity</label>
            <select value={filter.severity} onChange={(e) => setFilter((f) => ({ ...f, severity: e.target.value }))}>
              <option value="">All severities</option>
              <option value="blocker">Blocker</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button className="reset" type="button" onClick={() => setFilter({ year: "", product: "", stage: "", severity: "" })}>
            Reset
          </button>
          <span className="scopetag">Scope: {scopeText}</span>
        </div>

        <div className="card full summary-card" style={{ margin: "18px 0 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3>Summary</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="cs" style={{ margin: 0 }}>
                {summaryStatus}
              </span>
              <button
                className="sbtn"
                type="button"
                onClick={() => {
                  if (summaryRef.current) summaryRef.current.innerText = "";
                  persistSummary("");
                  setSummaryStatus("Cleared");
                }}
              >
                Clear
              </button>
              <button className="sbtn primary" type="button" onClick={downloadSummary}>
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

        <div style={{ margin: "26px 0 12px" }}>
          <h2 style={{ fontSize: 26 }}>Ticket creation trends</h2>
          <div className="cs" style={{ fontSize: 13, color: "var(--n700)" }}>
            All tickets created (not just open), by time bucket. Responds to the Product filter. Click a point to list all tickets
            created in that period (open &amp; solved).
          </div>
        </div>

        <div className="grid">
          <div className="card full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3>Tickets created</h3>
                <div className="cs">Count of tickets by creation date.</div>
              </div>
              <Seg value={createdBucket} onChange={setCreatedBucket} />
            </div>
            <div className="cv tall chart-clickable">
              <canvas ref={createdRef} />
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3>Tickets created by severity</h3>
                <div className="cs">One line per severity · click a point to list all tickets (open &amp; solved).</div>
              </div>
              <Seg value={createdSevBucket} onChange={setCreatedSevBucket} />
            </div>
            <div className="cv tall chart-clickable">
              <canvas ref={createdSevRef} />
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3>Tickets created by support level</h3>
                <div className="cs">
                  One line per support level (L1, L2, Vendor, L3 Internal). &quot;(none)&quot; = level not set · click a point to list
                  tickets.
                </div>
              </div>
              <Seg value={createdLvlBucket} onChange={setCreatedLvlBucket} />
            </div>
            <div className="cv tall chart-clickable">
              <canvas ref={createdLvlRef} />
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3>Tickets created by hardware vendor</h3>
                <div className="cs">
                  One line per hardware vendor. Account-wide for {vendor.name} — not product-filtered · click a point to list tickets.
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="fg">
                  <label>Support level</label>
                  <select value={hvLevel} onChange={(e) => setHvLevel(e.target.value)} style={{ minWidth: 130 }}>
                    <option value="">All levels</option>
                    <option value="L1">L1</option>
                    <option value="L2">L2</option>
                    <option value="L3">Vendor</option>
                    <option value="L3 Internal">L3 Internal</option>
                    <option value="(none)">(none)</option>
                  </select>
                </div>
                <Seg value={createdHvBucket} onChange={setCreatedHvBucket} />
              </div>
            </div>
            <div className="cv tall chart-clickable">
              <canvas ref={createdHvRef} />
            </div>
          </div>
        </div>

        <p className="hint">Tip: click any chart point or bar to list the tickets behind it — each row opens the ticket in DevRev.</p>

        <div className={`drill${drill ? " open" : ""}`} id="drill">
          <div className="dh">
            <div>
              <h3>{drill?.title || "Tickets"}</h3>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span className="cnt">{drill ? `${drill.tickets.length} ticket${drill.tickets.length === 1 ? "" : "s"}` : ""}</span>
              <button className="dclose" type="button" onClick={() => setDrill(null)}>
                Close
              </button>
            </div>
          </div>
          <div className="dbody">
            {drill && !drill.tickets.length ? (
              <div style={{ padding: "18px 20px", color: "#7a7579", fontSize: 14 }}>No tickets in this selection.</div>
            ) : null}
            {drill?.tickets.map((t) => {
              const status = t.isOpen ? "open" : "solved";
              const created = t.createdDate ? t.createdDate.slice(0, 10) : "—";
              return (
                <a key={t.id} className="tkt" href={`${TKT_BASE}${t.displayId}`} target="_blank" rel="noopener noreferrer">
                  <span className="sevdot" style={{ background: t.isOpen ? SEVCOL[t.severity] || C.orange : C.green }} />
                  <span className="tid">{t.displayId}</span>
                  <span className="tt">{t.title}</span>
                  <span className="tmeta">
                    {t.severity} · {LVLLABEL[t.supportLevel] || t.supportLevel} · {t.hardwareVendor} · created {created} · {status}
                  </span>
                  <span className="arrow">↗</span>
                </a>
              );
            })}
          </div>
        </div>

        <div className="grid">
          <div className="card full">
            <h3>Open tickets with no activity in {vendor.idle15Days} days — by stage</h3>
            <div className="cs">
              Open tickets whose last customer/agent comment is {vendor.idle15Days}+ days old (or never commented), grouped by
              current stage.
            </div>
            <div className="cv chart-clickable">
              <canvas ref={idle15Ref} />
            </div>
          </div>
        </div>

        <div style={{ margin: "30px 0 12px" }}>
          <h2 style={{ fontSize: 26 }}>Action lists</h2>
          <div className="cs" style={{ fontSize: 13, color: "var(--n700)" }}>
            Open tickets needing attention. Every row opens in DevRev. Lists respect the filters above.
          </div>
        </div>

        <ActionTable color="var(--r300)" title="Blocked tickets" rows={blocked} now={now} vendor={vendor} />
        <ActionTable color="var(--o300)" title={`No update in ${vendor.idleDays}+ days`} rows={idle3Sorted} now={now} vendor={vendor} />
        <ActionTable
          color="var(--n1300)"
          title={`Idle ${vendor.idle15Days}+ days (no activity)`}
          rows={idle15Sorted}
          now={now}
          vendor={vendor}
        />
      </div>

      <footer>
        <div className="wrap">
          <span className="note">
            {vendor.name} customer view · data refreshed {payload?.generatedAt ? new Date(payload.generatedAt).toUTCString() : "—"} ·
            products = ticket subtypes · idle = no comment {vendor.idleDays}+ days · click chart points for tickets
          </span>
        </div>
      </footer>
    </>
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
    <div className="tblcard">
      <div className="tbh">
        <span className="dot" style={{ background: color }} />
        <h3>{title}</h3>
        <span className="c">
          {rows.length} ticket{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="tblwrap">
        <table className="dtbl">
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
                <td className="empty" colSpan={7}>
                  No tickets in this selection.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <a className="idlink" href={`${TKT_BASE}${t.displayId}`} target="_blank" rel="noopener noreferrer">
                      {t.displayId}
                    </a>
                  </td>
                  <td className="ttl" title={t.title}>
                    {t.title}
                  </td>
                  <td>{productLabel(t.product, vendor.productLabels)}</td>
                  <td>{t.accountName}</td>
                  <td>{stageDisplay(t.stageKey, t.stageName)}</td>
                  <td>
                    <span className="sevbadge" style={{ background: SEVCOL[t.severity] }}>
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
