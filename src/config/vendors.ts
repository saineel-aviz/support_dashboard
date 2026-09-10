export type VendorSlug = "ebay" | "walmart";

/** How the "created by support level" chart is drawn. */
export type SupportLevelChartMode =
  /** Aviz (non-L3) + one line per hardware vendor for L3 tickets. */
  | "ebay-split"
  /** Two lines: Vendor (= L3) and Aviz (= everything else). */
  | "aviz-vendor";

export type VendorConfig = {
  slug: VendorSlug;
  name: string;
  envAccountIdsKey: string;
  productLabels: Record<string, string>;
  closedStageIds: string[];
  idleDays: number;
  idle15Days: number;
  supportLevelChart: SupportLevelChartMode;
  /** Stage keys treated as "pending on customer". */
  pendingCustomerStageIds: string[];
};

export const STAGE_LABELS: Record<string, string> = {
  "44": "Solved",
  "45": "Awaiting Customer Reply",
  "46": "Awaiting Vendor Response",
  "47": "New",
  "49": "In Progress",
  "54": "Awaiting Resolution",
  "19": "Resolved",
  "20": "Awaiting Customer",
  "23": "Work in Progress",
  "28": "Queued",
};

export const PRODUCT_LABELS: Record<string, string> = {
  sonic: "SONiC",
  asn: "ASN",
  apb: "APB",
  ones: "ONES",
  ncp: "NCP",
  ljsy4zdfonxx6wlynf5f6wlynf5f65lomrsym2lomxsa: "ONES · Fabric",
  ljsy4zdfonxx6wlynf5f6wlynf5f62lomnuyizlooq: "ONES · WCS",
  ljsy4zdfonxx6wlynf5f6wlynf5f64dsn5rgwzln: "ONES · DHCP",
  ljsy4zdfonxx6wlynf5f6wlynf5f64lxmxzvi2lpnw: "ONES · EVPN",
  ljsy4zdfonxx6wlynf5f6wlynf5f65dbonxq: "ONES · WCS Alerts",
  ljsy4zdfonxx6wlynf5f6wlynf5f62lomnuyizlooq2: "ONES · Misc",
};

export const vendors: Record<VendorSlug, VendorConfig> = {
  ebay: {
    slug: "ebay",
    name: "eBay",
    envAccountIdsKey: "DEVREV_EBAY_ACCOUNT_IDS",
    productLabels: PRODUCT_LABELS,
    closedStageIds: ["44", "19"],
    idleDays: 3,
    idle15Days: 15,
    supportLevelChart: "ebay-split",
    pendingCustomerStageIds: ["45", "20"],
  },
  walmart: {
    slug: "walmart",
    name: "Walmart",
    envAccountIdsKey: "DEVREV_WALMART_ACCOUNT_IDS",
    productLabels: PRODUCT_LABELS,
    closedStageIds: ["44", "19"],
    idleDays: 3,
    idle15Days: 15,
    supportLevelChart: "aviz-vendor",
    pendingCustomerStageIds: ["45", "20"],
  },
};

export const vendorList = Object.values(vendors);

export function isVendorSlug(value: string): value is VendorSlug {
  return value in vendors;
}

export function getVendor(slug: string): VendorConfig | null {
  if (!isVendorSlug(slug)) return null;
  return vendors[slug];
}

export function parseAccountIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function productLabel(key: string, overrides: Record<string, string>): string {
  if (!key) return "Untyped";
  return overrides[key] || key.toUpperCase();
}
