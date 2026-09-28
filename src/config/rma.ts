export const ORG_SLUG = "aviznetworks-main";

/** Default eBay account display_id in DevRev (overridable via DEVREV_ACCOUNT_IDS). */
export const EBAY_ACCOUNT_ID = "FlInn3gv";

export const CLOSED_STAGE_IDS = ["44", "19"];

export const ALL_VENDORS = ["Edgecore", "Wistron", "Dell", "Arista", "Celestica", "Cisco"] as const;
export type VendorName = (typeof ALL_VENDORS)[number];

export const VENDOR_COLORS: Record<string, string> = {
  Edgecore: "#6E4BEB",
  Wistron: "#12B5B0",
  Celestica: "#F5A623",
  Dell: "#8A94A6",
  Arista: "#B7A6F5",
  Cisco: "#4A2FB0",
};

export const ACCENT = "#6E4BEB";
export const ACCENT_SOFT = "#B7A6F5";
export const TEAL = "#12B5B0";
export const AMBER = "#F5A623";
export const MID = "#8A94A6";
export const GREY = "#C3CAD6";
export const GREEN = "#1F9D55";

export const SKU_PALETTE = [ACCENT, TEAL, ACCENT_SOFT, AMBER, MID, "#9B87F0", "#4A2FB0", GREY];

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const DEVREV_TICKET_URL = (displayId: string) =>
  `https://app.devrev.ai/${ORG_SLUG}/works/${displayId}`;

export const PAGE_SIZE = 15;
