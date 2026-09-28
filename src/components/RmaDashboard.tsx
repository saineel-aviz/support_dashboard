"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart,
  BarController,
  DoughnutController,
  LineController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip,
  type Chart as ChartType,
  type ChartConfiguration,
} from "chart.js";
import {
  ACCENT,
  ACCENT_SOFT,
  ALL_VENDORS,
  DEVREV_TICKET_URL,
  GREEN,
  GREY,
  MONTHS,
  PAGE_SIZE,
  SKU_PALETTE,
  VENDOR_COLORS,
} from "@/config/rma";
import type { DashboardPayload, RmaTicket } from "@/lib/dashboard/types";

Chart.register(
  BarController,
  DoughnutController,
  LineController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip,
);
Chart.defaults.font.family = "var(--font-body), system-ui, sans-serif";
Chart.defaults.color = "#333";

type Period = "all" | "year" | "quarter" | "month" | "custom";
type DrillState = { title: string; tickets: RmaTicket[] } | null;
type KpiKey = "total" | "solved" | "open" | "devices" | "skus" | "hi";

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso: string) {
  const dd = new Date(iso + "T00:00:00Z");
  return `${String(dd.getUTCDate()).padStart(2, "0")} ${MONTHS[dd.getUTCMonth()]} ${dd.getUTCFullYear()}`;
}

function useChart(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  build: () => ChartConfiguration | null,
  deps: unknown[],
) {
  const chartRef = useRef<ChartType | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cfg = build();
    chartRef.current?.destroy();
    chartRef.current = null;
    if (!cfg) return;
    chartRef.current = new Chart(canvas, cfg);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function TicketRow({ r }: { r: RmaTicket }) {
  const sevPill =
    r.sev === "high" || r.sev === "blocker" ? (
      <span className="pill hi">{cap(r.sev)}</span>
    ) : (
      <span className="pill">{cap(r.sev)}</span>
    );
  return (
    <tr>
      <td className="id">
        <a className="id-link" href={DEVREV_TICKET_URL(r.id)} target="_blank" rel="noopener noreferrer">
          {r.id}
        </a>
      </td>
      <td>{r.title}</td>
      <td>{r.vendor}</td>
      <td>{r.sku}</td>
      <td>{sevPill}</td>
      <td>{r.status}</td>
      <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
    </tr>
  );
}

export function RmaDashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [year, setYear] = useState<number | null>(null);
  const [quarter, setQuarter] = useState(1);
  const [month, setMonth] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [drill, setDrill] = useState<DrillState>(null);
  const [pageNum, setPageNum] = useState(1);
  const selRef = useRef<HTMLDivElement | null>(null);

  const trendRef = useRef<HTMLCanvasElement | null>(null);
  const vendorTrendRef = useRef<HTMLCanvasElement | null>(null);
  const skuTrendRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<HTMLCanvasElement | null>(null);
  const sevRef = useRef<HTMLCanvasElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPayload(data as DashboardPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(() => payload?.tickets ?? [], [payload]);

  const years = useMemo(
    () => [...new Set(data.map((d) => d.y))].sort((a, b) => b - a),
    [data],
  );

  const dateBounds = useMemo(() => {
    const dates = data.map((d) => d.date).sort();
    return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
  }, [data]);

  useEffect(() => {
    if (years.length && year == null) setYear(years[0]);
  }, [years, year]);

  useEffect(() => {
    if (dateBounds.min && !fromDate) setFromDate(dateBounds.min);
    if (dateBounds.max && !toDate) setToDate(dateBounds.max);
  }, [dateBounds, fromDate, toDate]);

  const { rows, scope } = useMemo(() => {
    let rows = data;
    let scope = "All time";
    const y = year ?? years[0];
    if (period === "year" && y != null) {
      rows = data.filter((d) => d.y === y);
      scope = String(y);
    } else if (period === "quarter" && y != null) {
      rows = data.filter((d) => d.y === y && d.q === quarter);
      scope = `Q${quarter} ${y}`;
    } else if (period === "month" && y != null) {
      rows = data.filter((d) => d.y === y && d.m === month);
      scope = `${MONTHS[month]} ${y}`;
    } else if (period === "custom") {
      let f = fromDate || dateBounds.min;
      let t = toDate || dateBounds.max;
      if (f && t && f > t) {
        const tmp = f;
        f = t;
        t = tmp;
      }
      rows = data.filter((d) => (!f || d.date >= f) && (!t || d.date <= t));
      scope = f && t ? `${fmtDate(f)} → ${fmtDate(t)}` : "Custom range";
    }
    return { rows, scope };
  }, [data, period, year, years, quarter, month, fromDate, toDate, dateBounds]);

  useEffect(() => {
    setDrill(null);
    setPageNum(1);
  }, [period, year, quarter, month, fromDate, toDate, payload]);

  const showSelection = useCallback((title: string, tickets: RmaTicket[]) => {
    setDrill({ title, tickets });
    requestAnimationFrame(() => {
      selRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const kpis = useMemo(() => {
    const solvedN = rows.filter((r) => r.solved).length;
    const openN = rows.length - solvedN;
    const vendorSet = new Set(rows.map((r) => r.vendor));
    const skuSet = new Set(rows.filter((r) => r.sku !== "Unspecified").map((r) => r.sku));
    const hiN = rows.filter((r) => r.hi).length;
    return { total: rows.length, solvedN, openN, vendors: vendorSet.size, skus: skuSet.size, hiN };
  }, [rows]);

  const vendorCounts = useMemo(
    () => ALL_VENDORS.map((v) => rows.filter((r) => r.vendor === v).length),
    [rows],
  );
  const vmax = Math.max(1, ...vendorCounts);

  const months = useMemo(() => [...new Set(rows.map((r) => r.ym))].sort(), [rows]);
  const trendLabels = useMemo(
    () =>
      months.map((mk) => {
        const [yy, mm] = mk.split("-");
        return `${MONTHS[+mm - 1]} ${yy.slice(2)}`;
      }),
    [months],
  );

  const execSummary = useMemo(() => {
    if (!rows.length) return "No RMA tickets in this period.";
    const solvedPct = Math.round((kpis.solvedN / rows.length) * 100);
    const topVendor = ALL_VENDORS.map((v, i) => [v, vendorCounts[i]] as const).sort((a, b) => b[1] - a[1])[0];
    return (
      <>
        Across <b className="text-[#B7A6F5]">{rows.length}</b> RMA tickets ({scope}),{" "}
        <b className="text-[#B7A6F5]">{solvedPct}%</b> are resolved.{" "}
        <b className="text-[#B7A6F5]">{topVendor[0]}</b> leads with{" "}
        <b className="text-[#B7A6F5]">{topVendor[1]}</b> RMAs, spanning{" "}
        <b className="text-[#B7A6F5]">{kpis.skus}</b> distinct SKUs.
      </>
    );
  }, [rows, kpis, scope, vendorCounts]);

  const skuOrder = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.sku, (counts.get(r.sku) || 0) + 1));
    return [...counts.keys()].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
  }, [rows]);

  const skuColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    skuOrder.forEach((s, i) => {
      m[s] = s === "Unspecified" ? GREY : SKU_PALETTE[i % SKU_PALETTE.length];
    });
    return m;
  }, [skuOrder]);

  const pqRows = useMemo(() => {
    const yrs = [...new Set(rows.map((r) => r.y))].sort();
    const out: { label: string; count: number; tickets: RmaTicket[]; yearTotal?: boolean }[] = [];
    yrs.forEach((yy) => {
      for (let qq = 1; qq <= 4; qq++) {
        const qrows = rows.filter((r) => r.y === yy && r.q === qq);
        if (!qrows.length) continue;
        out.push({ label: `Q${qq} ${yy}`, count: qrows.length, tickets: qrows });
      }
      const yrows = rows.filter((r) => r.y === yy);
      out.push({ label: `${yy} total`, count: yrows.length, tickets: yrows, yearTotal: true });
    });
    return out;
  }, [rows]);

  const pageRows = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    [rows],
  );
  const pages = Math.max(1, Math.ceil(pageRows.length / PAGE_SIZE));
  const pageSlice = pageRows.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);

  useChart(
    trendRef,
    () => ({
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          {
            data: months.map((mk) => rows.filter((r) => r.ym === mk).length),
            borderColor: ACCENT,
            backgroundColor: "rgba(110,75,235,0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: ACCENT,
          },
        ],
      },
      options: {
        onClick: (_e, el) => {
          if (!el.length) return;
          const mk = months[el[0].index];
          showSelection(`${trendLabels[el[0].index]} RMA tickets`, rows.filter((r) => r.ym === mk));
        },
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1 }, grid: { color: "#EEE" } },
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 60 } },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    }),
    [months, trendLabels, rows, showSelection],
  );

  useChart(
    vendorTrendRef,
    () => {
      const present = ALL_VENDORS.filter((v) => rows.some((r) => r.vendor === v));
      return {
        type: "bar",
        data: {
          labels: trendLabels,
          datasets: present.map((v) => ({
            label: v,
            data: months.map((mk) => rows.filter((r) => r.ym === mk && r.vendor === v).length),
            backgroundColor: VENDOR_COLORS[v] || ACCENT,
            borderRadius: 4,
            stack: "v",
          })),
        },
        options: {
          onClick: (_e, el) => {
            if (!el.length) return;
            const mk = months[el[0].index];
            const v = present[el[0].datasetIndex];
            showSelection(
              `${v} — ${trendLabels[el[0].index]} RMA tickets`,
              rows.filter((r) => r.ym === mk && r.vendor === v),
            );
          },
          plugins: {
            legend: { position: "bottom", labels: { padding: 10, boxWidth: 12, font: { size: 11 } } },
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 60 },
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: { precision: 0, stepSize: 1 },
              grid: { color: "#EEE" },
            },
          },
          responsive: true,
          maintainAspectRatio: false,
        },
      };
    },
    [months, trendLabels, rows, showSelection],
  );

  useChart(
    skuTrendRef,
    () => ({
      type: "bar",
      data: {
        labels: trendLabels,
        datasets: skuOrder.map((s) => ({
          label: s,
          data: months.map((mk) => rows.filter((r) => r.ym === mk && r.sku === s).length),
          backgroundColor: skuColorMap[s],
          borderRadius: 4,
          stack: "s",
        })),
      },
      options: {
        onClick: (_e, el) => {
          if (!el.length) return;
          const mk = months[el[0].index];
          const s = skuOrder[el[0].datasetIndex];
          showSelection(
            `${s} — ${trendLabels[el[0].index]} RMA tickets`,
            rows.filter((r) => r.ym === mk && r.sku === s),
          );
        },
        plugins: {
          legend: { position: "bottom", labels: { padding: 10, boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 60 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0, stepSize: 1 },
            grid: { color: "#EEE" },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    }),
    [months, trendLabels, rows, skuOrder, skuColorMap, showSelection],
  );

  useChart(
    statusRef,
    () => ({
      type: "line",
      data: {
        labels: trendLabels,
        datasets: [
          {
            label: "Solved",
            data: months.map((mk) => rows.filter((r) => r.ym === mk && r.solved).length),
            borderColor: GREEN,
            backgroundColor: "rgba(31,157,85,0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: GREEN,
          },
          {
            label: "Open / pending",
            data: months.map((mk) => rows.filter((r) => r.ym === mk && !r.solved).length),
            borderColor: ACCENT,
            backgroundColor: "rgba(110,75,235,0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: ACCENT,
          },
        ],
      },
      options: {
        onClick: (_e, el) => {
          if (!el.length) return;
          const mk = months[el[0].index];
          const solved = el[0].datasetIndex === 0;
          showSelection(
            `${solved ? "Solved" : "Open / pending"} — ${trendLabels[el[0].index]} RMA tickets`,
            rows.filter((r) => r.ym === mk && r.solved === solved),
          );
        },
        plugins: {
          legend: { position: "bottom", labels: { padding: 12, boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1 }, grid: { color: "#EEE" } },
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 60 } },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    }),
    [months, trendLabels, rows, showSelection],
  );

  useChart(
    sevRef,
    () => {
      const sevOrder = ["blocker", "high", "medium", "low"] as const;
      const sevF = sevOrder.filter((s) => rows.some((r) => r.sev === s));
      return {
        type: "doughnut",
        data: {
          labels: sevF.map(cap),
          datasets: [
            {
              data: sevF.map((s) => rows.filter((r) => r.sev === s).length),
              backgroundColor: ["#4A2FB0", ACCENT, ACCENT_SOFT, GREY],
              borderWidth: 2,
              borderColor: "#fff",
            },
          ],
        },
        options: {
          onClick: (_e, el) => {
            if (!el.length) return;
            const s = sevF[el[0].index];
            showSelection(`${cap(s)} severity RMA tickets`, rows.filter((r) => r.sev === s));
          },
          plugins: {
            legend: { position: "bottom", labels: { padding: 12, boxWidth: 12, font: { size: 11 } } },
          },
          responsive: true,
          maintainAspectRatio: false,
          cutout: "58%",
        },
      };
    },
    [rows, showSelection],
  );

  function onKpi(k: KpiKey) {
    if (k === "total") showSelection("All RMA tickets", rows);
    else if (k === "solved") showSelection("Solved RMA tickets", rows.filter((r) => r.solved));
    else if (k === "open") showSelection("Open / pending RMA tickets", rows.filter((r) => !r.solved));
    else if (k === "hi") showSelection("High / blocker RMA tickets", rows.filter((r) => r.hi));
    else if (k === "skus")
      showSelection(
        "RMA tickets with a known SKU",
        rows.filter((r) => r.sku !== "Unspecified"),
      );
    else if (k === "devices") showSelection("All RMA tickets by vendor", rows);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const generated = payload?.generatedAt
    ? new Date(payload.generatedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  function onYearChange(value: number) {
    setYear(value);
    // Choosing a year alone scopes to that year unless already in a finer mode
    if (period === "all" || period === "custom") setPeriod("year");
  }

  function onQuarterChange(value: number) {
    setQuarter(value);
    setPeriod("quarter");
  }

  function onMonthChange(value: number) {
    setMonth(value);
    setPeriod("month");
  }

  function onFromChange(value: string) {
    setFromDate(value);
    setPeriod("custom");
  }

  function onToChange(value: string) {
    setToDate(value);
    setPeriod("custom");
  }

  return (
    <div className="wrap">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-dark pb-6">
        <span className="eyebrow">Support analytics</span>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-outline no-print" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="btn-outline no-print" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <h1 className="mt-5 font-display text-[40px] font-bold leading-none tracking-[0.0075em]">
        eBay — RMA dashboard
      </h1>
      <p className="sub mt-2.5 max-w-[760px] text-base leading-snug text-body">
        All eBay hardware RMA (Return Merchandise Authorization) tickets across every ticket type, broken down by
        switch vendor, SKU, and trend over time. Use the filters to view any month, quarter, year, or all time.
      </p>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="execbar mt-[18px] flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface px-5 py-4 text-white">
        <p className="m-0 max-w-[760px] text-[15px] leading-snug">{loading && !payload ? "Loading tickets…" : execSummary}</p>
        <div className="viewctl no-print flex items-center gap-2.5">
          <button type="button" className="printbtn" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </div>

      <div className="filter-box no-print">
        <div className="fgroup">
          <label htmlFor="period">Period</label>
          <select
            id="period"
            className="fcontrol"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="all">All time</option>
            <option value="year">Year</option>
            <option value="quarter">Quarter</option>
            <option value="month">Month</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        <div className="fgroup">
          <label htmlFor="year">Year</label>
          <select
            id="year"
            className="fcontrol"
            value={year ?? ""}
            onChange={(e) => onYearChange(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="fgroup">
          <label htmlFor="quarter">Quarter</label>
          <select
            id="quarter"
            className="fcontrol"
            value={quarter}
            onChange={(e) => onQuarterChange(Number(e.target.value))}
          >
            <option value={1}>Q1 (Jan–Mar)</option>
            <option value={2}>Q2 (Apr–Jun)</option>
            <option value={3}>Q3 (Jul–Sep)</option>
            <option value={4}>Q4 (Oct–Dec)</option>
          </select>
        </div>
        <div className="fgroup">
          <label htmlFor="month">Month</label>
          <select
            id="month"
            className="fcontrol"
            value={month}
            onChange={(e) => onMonthChange(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="fgroup">
          <label htmlFor="fromDate">From</label>
          <input
            type="date"
            id="fromDate"
            className="fcontrol"
            min={dateBounds.min || undefined}
            max={dateBounds.max || undefined}
            value={fromDate}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
        <div className="fgroup">
          <label htmlFor="toDate">To</label>
          <input
            type="date"
            id="toDate"
            className="fcontrol"
            min={dateBounds.min || undefined}
            max={dateBounds.max || undefined}
            value={toDate}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
        <span className="scope-pill">{scope}</span>
      </div>

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        {(
          [
            ["total", kpis.total, "Total RMA count", true],
            ["solved", kpis.solvedN, "Solved / closed", false],
            ["open", kpis.openN, "Open / pending", false],
            ["devices", kpis.vendors, "Vendors involved", false],
            ["skus", kpis.skus, "SKUs affected", false],
            ["hi", kpis.hiN, "High / blocker", false],
          ] as const
        ).map(([key, num, lbl, hl]) => (
          <button
            key={key}
            type="button"
            className={`kpi-card clickable text-left ${hl ? "hl" : ""}`}
            onClick={() => onKpi(key)}
          >
            <div className="kpi-num">{num}</div>
            <div className="kpi-lbl">{lbl}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-6">
        {ALL_VENDORS.map((v, i) => {
          const n = vendorCounts[i];
          return (
            <button
              key={v}
              type="button"
              className={`vcard ${n === vmax && n > 0 ? "hot" : ""} ${n === 0 ? "zero" : ""}`}
              onClick={() => showSelection(`${v} RMA tickets`, rows.filter((r) => r.vendor === v))}
            >
              <div className="font-mono-ui text-[11px] uppercase tracking-[0.05em] text-muted">{v}</div>
              <div className="mt-2 font-display text-[34px] font-black leading-none">{n}</div>
              <div
                className="mt-2.5 h-1 rounded-sm"
                style={{
                  width: `${Math.max(4, Math.round((n / vmax) * 100))}%`,
                  background: VENDOR_COLORS[v] || ACCENT,
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="panel">
          <h2>RMA trend (monthly)</h2>
          <div className="relative h-[280px] cursor-pointer">
            <canvas ref={trendRef} />
          </div>
        </div>
        <div className="panel">
          <h2>RMA by quarter / year</h2>
          <div className="max-h-[280px] overflow-y-auto">
            <table className="minitable">
              <thead>
                <tr>
                  <th>Period</th>
                  <th style={{ textAlign: "right" }}>RMAs</th>
                </tr>
              </thead>
              <tbody>
                {pqRows.map((r) => (
                  <tr
                    key={r.label}
                    style={r.yearTotal ? { fontWeight: 600, background: "var(--color-accent-soft)" } : undefined}
                    onClick={() => showSelection(`${r.label} RMA tickets`, r.tickets)}
                  >
                    <td>{r.label}</td>
                    <td style={{ textAlign: "right" }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td style={{ textAlign: "right" }}>{rows.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="panel">
          <h2>RMA trend by switch vendor (monthly)</h2>
          <div className="relative h-[280px] cursor-pointer">
            <canvas ref={vendorTrendRef} />
          </div>
        </div>
        <div className="panel">
          <h2>RMA count by vendor</h2>
          <table className="minitable">
            <thead>
              <tr>
                <th>Switch vendor</th>
                <th style={{ textAlign: "right" }}>RMAs</th>
                <th style={{ textAlign: "right" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {ALL_VENDORS.map((v, i) => {
                const n = vendorCounts[i];
                const pct = rows.length ? Math.round((n / rows.length) * 100) : 0;
                return (
                  <tr key={v} onClick={() => showSelection(`${v} RMA tickets`, rows.filter((r) => r.vendor === v))}>
                    <td>
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                        style={{ background: VENDOR_COLORS[v] || ACCENT }}
                      />
                      {v}
                    </td>
                    <td style={{ textAlign: "right" }}>{n}</td>
                    <td style={{ textAlign: "right" }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td style={{ textAlign: "right" }}>{rows.length}</td>
                <td style={{ textAlign: "right" }}>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="panel">
          <h2>RMA by SKU (monthly trend)</h2>
          <div className="relative h-[280px] cursor-pointer">
            <canvas ref={skuTrendRef} />
          </div>
        </div>
        <div className="panel">
          <h2>RMA count by SKU</h2>
          <table className="minitable">
            <thead>
              <tr>
                <th>Switch SKU</th>
                <th style={{ textAlign: "right" }}>RMAs</th>
                <th style={{ textAlign: "right" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {skuOrder.map((s) => {
                const n = rows.filter((r) => r.sku === s).length;
                const pct = rows.length ? Math.round((n / rows.length) * 100) : 0;
                return (
                  <tr key={s} onClick={() => showSelection(`${s} RMA tickets`, rows.filter((r) => r.sku === s))}>
                    <td>
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                        style={{ background: skuColorMap[s] }}
                      />
                      {s}
                    </td>
                    <td style={{ textAlign: "right" }}>{n}</td>
                    <td style={{ textAlign: "right" }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td style={{ textAlign: "right" }}>{rows.length}</td>
                <td style={{ textAlign: "right" }}>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="panel">
          <h2>Open vs solved</h2>
          <div className="relative h-[280px] cursor-pointer">
            <canvas ref={statusRef} />
          </div>
        </div>
        <div className="panel">
          <h2>RMA by severity</h2>
          <div className="relative h-[280px] cursor-pointer">
            <canvas ref={sevRef} />
          </div>
        </div>
      </div>

      <p className="mt-3.5 text-sm text-body">
        Tip: click any bar, segment, vendor card, or KPI to see the matching RMA tickets below.
      </p>

      {drill ? (
        <div ref={selRef} className="panel mt-6 border-2 border-accent">
          <div className="flex items-center justify-between gap-3">
            <h2 className="mb-0">
              {drill.title} — {drill.tickets.length} ticket{drill.tickets.length === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              className="rounded-full border border-dark bg-white px-3.5 py-1.5 font-mono-ui text-xs uppercase tracking-[0.04em] transition hover:bg-dark hover:text-white"
              onClick={() => setDrill(null)}
            >
              Clear ×
            </button>
          </div>
          <p className="my-2 text-[13px] text-[#666]">
            Click a chart bar, segment, vendor card, or KPI to drill into the matching tickets.
          </p>
          <div className="overflow-x-auto">
            <table className="main-table mt-0">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Vendor</th>
                  <th>SKU</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {[...drill.tickets]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((r) => (
                    <TicketRow key={`sel-${r.id}`} r={r} />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <h2 className="mt-8 font-display text-[22px] font-semibold">All RMA tickets in period</h2>
      {pageSlice.length ? (
        <table className="main-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Title</th>
              <th>Vendor</th>
              <th>SKU</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {pageSlice.map((r) => (
              <TicketRow key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-10 py-10 text-center text-[15px] text-[#888]">
          {loading ? "Loading…" : "No RMA tickets in this period."}
        </div>
      )}

      {pageRows.length > PAGE_SIZE ? (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono-ui text-xs text-[#666]">
            Showing {(pageNum - 1) * PAGE_SIZE + 1}–{(pageNum - 1) * PAGE_SIZE + pageSlice.length} of{" "}
            {pageRows.length} tickets · Page {pageNum} / {pages}
          </span>
          <div className="flex gap-2">
            <button type="button" className="pager-btn" disabled={pageNum <= 1} onClick={() => setPageNum((p) => p - 1)}>
              ← Prev
            </button>
            <button
              type="button"
              className="pager-btn"
              disabled={pageNum >= pages}
              onClick={() => setPageNum((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}

      <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t border-line pt-5 text-[13px] text-[#666]">
        <span>
          Source: DevRev support tickets · eBay account · {data.length} RMA tickets
          {payload?.sourceCount != null ? ` of ${payload.sourceCount} eBay tickets` : ""}
          {dateBounds.min && dateBounds.max
            ? ` (${MONTHS[+dateBounds.min.slice(5, 7) - 1]} ${dateBounds.min.slice(0, 4)} – ${MONTHS[+dateBounds.max.slice(5, 7) - 1]} ${dateBounds.max.slice(0, 4)})`
            : ""}
          , title-matched RMA / DOA
        </span>
        <span>{generated ? `Generated ${generated}` : ""}</span>
      </footer>
    </div>
  );
}
