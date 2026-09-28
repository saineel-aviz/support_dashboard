import { ALL_VENDORS, type VendorName } from "@/config/rma";
import type { DashboardTicket, RmaTicket, Severity } from "@/lib/dashboard/types";

/** Known SKUs → default vendor (aligned with Desktop Dashboard sku.ts). */
const SKU_VENDOR: Record<string, VendorName> = {
  AS9716: "Edgecore",
  AS9736: "Edgecore",
  AS4630: "Edgecore",
  AS5835: "Edgecore",
  "Wistron ES1227": "Wistron",
  "Wistron 6512": "Wistron",
  "Wistron 3200": "Wistron",
  DS4000: "Celestica",
  DS2000: "Celestica",
  DS1000: "Celestica",
  Z9332: "Dell",
  "Cisco 8102": "Cisco",
  "7060": "Arista",
};

const KNOWN_SKUS = Object.keys(SKU_VENDOR);

const HOST_RE = /\b([a-z]{2,}(?:az|mdf)?\d{0,2}-[a-z]{2}\d{2,5})\b/i;

/** True when a ticket looks like a hardware RMA / DOA case. */
export function isRmaTicket(t: DashboardTicket): boolean {
  const title = t.title || "";
  if (/\brma\b|rma['’]?ed|\bdoa\b/i.test(title)) return true;
  if (/\brma\s*follow[- ]?up\b|\bfollow[- ]?up.*\brma\b/i.test(title)) return true;
  return false;
}

/**
 * Parse model/SKU from title — same taxonomy as Desktop Dashboard `modelSkuFromTitle`.
 * Returns canonical label or "Unspecified".
 */
export function modelSkuFromTitle(title: string): string {
  const t = title || "";

  if (/\bCisco\s*8102\b/i.test(t) || /\[Cisco\s*8102\]/i.test(t)) return "Cisco 8102";
  if (/\bZ9332\b/i.test(t) || /\[Z9332/i.test(t)) return "Z9332";
  if (/\bDS\s*4000\b/i.test(t) || /\[DS\s*4000\]/i.test(t)) return "DS4000";
  if (/\bDS\s*2000\b/i.test(t) || /\[DS\s*2000\]/i.test(t)) return "DS2000";
  if (/\bDS\s*1000\b/i.test(t) || /\[DS\s*1000\]/i.test(t) || /\bDS1000(?:-R)?\b/i.test(t)) return "DS1000";

  if (
    /\b(?:Wistron\s*)?ES[-\s]?1227\b/i.test(t) ||
    /\[(?:Wistron\s*)?ES[-\s]?1227\]/i.test(t) ||
    /\[Wistron\s*1227\]/i.test(t)
  ) {
    return "Wistron ES1227";
  }
  if (/\b(?:Wistron\s*)?6512\b/i.test(t) || /\[(?:Wistron\s*)?6512\]/i.test(t)) return "Wistron 6512";
  if (/\b(?:Wistron\s*)?3200k?\b/i.test(t) || /\b32k\b/i.test(t) || /\[(?:Wistron\s*)?3200/i.test(t)) {
    return "Wistron 3200";
  }

  if (/\bAS\s?9736\b/i.test(t) || /\[AS9736\]/i.test(t) || /\[EC\s?9736\]/i.test(t) || /\bEC\s?9736\b/i.test(t)) {
    return "AS9736";
  }
  if (
    /\bAS\s?9716\b/i.test(t) ||
    /\[AS9716\]/i.test(t) ||
    /\[EC\s?9716\]/i.test(t) ||
    /\bEC\s?9716\b/i.test(t) ||
    /\[EC9716\]/i.test(t) ||
    /\bEC9716\b/i.test(t) ||
    /\[\s*9716\s*\]/i.test(t)
  ) {
    return "AS9716";
  }
  if (/\bAS\s?5835\b/i.test(t) || /\[AS5835\]/i.test(t)) return "AS5835";
  if (
    /\bAS\s?4630\b/i.test(t) ||
    /\[AS4630\]/i.test(t) ||
    /\[EC\s?4630\]/i.test(t) ||
    /\bEC\s?4630\b/i.test(t) ||
    /\bEC4630\b/i.test(t) ||
    /\[\s*4630\s*\]/i.test(t)
  ) {
    return "AS4630";
  }

  if (/\bArista\s*7060\b/i.test(t) || /\[Arista\s*7060/i.test(t)) return "7060";

  // Bracket token that looks like a model
  const bracket = t.match(/\[([^\]]{2,32})\]/);
  if (bracket) {
    const inner = bracket[1].replace(/^(eBay|Walmart|RMA)[:\s-]*/i, "").trim();
    if (/^(AS|EC|DS|Z)\s?\d{3,5}/i.test(inner) || /Wistron|Cisco|Celestica|Dell|Arista/i.test(inner)) {
      const known = modelSkuFromTitle(inner);
      if (known !== "Unspecified") return known;
    }
  }

  return "Unspecified";
}

export function extractSku(title: string, customSku?: string | null): { sku: string; vendorHint: VendorName | null } {
  if (customSku) {
    const v = customSku.trim();
    for (const k of KNOWN_SKUS) {
      if (new RegExp(k.replace(/\s+/g, "\\s*"), "i").test(v)) {
        return { sku: k, vendorHint: SKU_VENDOR[k] || null };
      }
    }
    const fromRaw = modelSkuFromTitle(v);
    if (fromRaw !== "Unspecified") {
      return { sku: fromRaw, vendorHint: SKU_VENDOR[fromRaw] || null };
    }
  }

  const sku = modelSkuFromTitle(title);
  return { sku, vendorHint: SKU_VENDOR[sku] || null };
}

function normalizeVendor(raw: string): VendorName | null {
  const v = raw.trim().toLowerCase();
  if (!v || v === "(none)" || v === "(untagged)") return null;
  for (const name of ALL_VENDORS) {
    if (v.includes(name.toLowerCase())) return name;
  }
  if (v.includes("edge-core") || v.includes("edge core")) return "Edgecore";
  return null;
}

export function resolveVendor(ticket: DashboardTicket, vendorHint: VendorName | null): string {
  const fromField = normalizeVendor(ticket.hardwareVendor);
  if (fromField) return fromField;
  if (vendorHint) return vendorHint;
  const fromTitle = normalizeVendor(ticket.title);
  if (fromTitle) return fromTitle;
  return "Edgecore";
}

export function extractHost(title: string): string {
  const m = title.match(HOST_RE);
  return m ? m[1].toLowerCase() : "";
}

function dateOnly(iso: string | null): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function statusLabel(t: DashboardTicket): string {
  if (t.isSolvedStage || !t.isOpen) {
    if (/cancel/i.test(t.stageName)) return "Canceled";
    if (/closed/i.test(t.stageName)) return "Closed";
    return "Solved";
  }
  return "Open";
}

export function toRmaTicket(t: DashboardTicket): RmaTicket | null {
  const date = dateOnly(t.createdDate);
  if (!date) return null;

  const { sku, vendorHint } = extractSku(t.title);
  const vendor = resolveVendor(t, vendorHint);
  const d = new Date(date + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const sev: Severity = t.severity;
  const status = statusLabel(t);
  const solved = status === "Solved" || status === "Closed";

  return {
    id: t.displayId,
    title: t.title,
    sku,
    vendor,
    sev,
    status,
    date,
    host: extractHost(t.title),
    solved,
    y,
    m,
    q: Math.floor(m / 3) + 1,
    ym: `${y}-${String(m + 1).padStart(2, "0")}`,
    hi: sev === "high" || sev === "blocker",
  };
}
