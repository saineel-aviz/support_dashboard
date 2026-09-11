/** Model / SKU + software (NOS) labels — match reference HTML taxonomy. */

const KNOWN_SKUS = [
  "AS9716",
  "AS9736",
  "AS4630",
  "AS5835",
  "Wistron ES1227",
  "Wistron 6512",
  "Wistron 3200",
  "DS4000",
  "DS2000",
  "DS1000",
  "Z9332",
  "Cisco 8102",
] as const;

function normalizeSoftLabel(raw: string): string {
  const v = raw.trim();
  if (!v || /^(none|n\/a|unset|unknown|-)$/i.test(v)) return "(unspecified)";
  if (/edgecore[- ]?sonic/i.test(v) || /^ec[- ]?sonic/i.test(v)) return "Edgecore-SONiC";
  if (/innovium/i.test(v)) {
    const m = v.match(/(\d+\.\d+\.\d+)/);
    return m ? `Innovium ${m[1]}` : "Innovium 2.2.12";
  }
  if (/wistron/i.test(v)) {
    const m = v.match(/(\d+\.\d+\.\d+)/);
    return m ? `Wistron ${m[1]}` : v;
  }
  if (/celestica|ecs/i.test(v)) {
    const m = v.match(/(\d+\.\d+\.\d+)/);
    return m ? `Celestica ${m[1]}` : v;
  }
  if (/sonic/i.test(v)) return "SONiC (other)";
  if (v.length > 48) return "Other";
  return v;
}

/** Parse model/SKU from title brackets and free text. */
export function modelSkuFromTitle(title: string): string {
  const t = title || "";

  if (/\bCisco\s*8102\b/i.test(t) || /\[Cisco\s*8102\]/i.test(t)) return "Cisco 8102";
  if (/\bZ9332\b/i.test(t) || /\[Z9332/i.test(t)) return "Z9332";
  if (/\bDS\s*4000\b/i.test(t) || /\[DS\s*4000\]/i.test(t)) return "DS4000";
  if (/\bDS\s*2000\b/i.test(t) || /\[DS\s*2000\]/i.test(t)) return "DS2000";
  if (/\bDS\s*1000\b/i.test(t) || /\[DS\s*1000\]/i.test(t)) return "DS1000";

  if (/\b(?:Wistron\s*)?ES[-\s]?1227\b/i.test(t) || /\[(?:Wistron\s*)?ES[-\s]?1227\]/i.test(t) || /\[Wistron\s*1227\]/i.test(t)) {
    return "Wistron ES1227";
  }
  if (/\b(?:Wistron\s*)?6512\b/i.test(t) || /\[(?:Wistron\s*)?6512\]/i.test(t)) return "Wistron 6512";
  if (/\b(?:Wistron\s*)?3200k?\b/i.test(t) || /\b32k\b/i.test(t) || /\[(?:Wistron\s*)?3200/i.test(t)) {
    return "Wistron 3200";
  }

  if (/\bAS\s?9736\b/i.test(t) || /\[AS9736\]/i.test(t) || /\[EC\s?9736\]/i.test(t) || /\bEC\s?9736\b/i.test(t)) {
    return "AS9736";
  }
  if (/\bAS\s?9716\b/i.test(t) || /\[AS9716\]/i.test(t) || /\[EC\s?9716\]/i.test(t) || /\bEC\s?9716\b/i.test(t)) {
    return "AS9716";
  }
  if (/\bAS\s?5835\b/i.test(t) || /\[AS5835\]/i.test(t)) return "AS5835";
  if (
    /\bAS\s?4630\b/i.test(t) ||
    /\[AS4630\]/i.test(t) ||
    /\[EC\s?4630\]/i.test(t) ||
    /\bEC\s?4630\b/i.test(t) ||
    /\[AS4630\]/i.test(t)
  ) {
    return "AS4630";
  }

  if (/\bTBD\b/i.test(t) || /\[Arista/i.test(t)) return "TBD";

  // Bracket token that looks like a model
  const bracket = t.match(/\[([^\]]{2,32})\]/);
  if (bracket) {
    const inner = bracket[1].replace(/^(eBay|Walmart|RMA)[:\s-]*/i, "").trim();
    if (/^(AS|EC|DS|Z)\s?\d{3,5}/i.test(inner) || /Wistron|Cisco|Celestica|Dell/i.test(inner)) {
      const known = modelSkuFromTitle(inner);
      if (known !== "(unspecified)") return known;
      if (inner.length <= 24) return "Other";
    }
  }

  return "(unspecified)";
}

export function normalizeModelSku(raw: string | null, title: string): string {
  if (raw) {
    const v = raw.trim();
    for (const k of KNOWN_SKUS) {
      if (new RegExp(k.replace(/\s+/g, "\\s*"), "i").test(v)) return k;
    }
    const fromRaw = modelSkuFromTitle(v);
    if (fromRaw !== "(unspecified)") return fromRaw;
    if (/^tbd$/i.test(v)) return "TBD";
    if (v.length <= 28 && !/rma|need |device |inc\d+/i.test(v)) return "Other";
  }
  return modelSkuFromTitle(title);
}

export function normalizeSoftware(raw: string | null, title: string): string {
  if (raw) return normalizeSoftLabel(raw);

  // Title hints (e.g. ECS4.0.15)
  const ecs = title.match(/ECS\s*(\d+\.\d+\.\d+)/i);
  if (ecs) return `Celestica ${ecs[1]}`;
  const cel = title.match(/Celestica[^0-9]*(\d+\.\d+\.\d+)/i);
  if (cel) return `Celestica ${cel[1]}`;
  const wis = title.match(/Wistron[^0-9]*(\d+\.\d+\.\d+)/i);
  if (wis) return `Wistron ${wis[1]}`;
  const inn = title.match(/Innovium[^0-9]*(\d+\.\d+\.\d+)/i);
  if (inn) return `Innovium ${inn[1]}`;
  if (/Edgecore[- ]?SONiC|SONiC\.eBay\.Cisco/i.test(title)) {
    return /Cisco/i.test(title) ? "SONiC (other)" : "Edgecore-SONiC";
  }

  return "(unspecified)";
}

export const SKU_PALETTE = [
  "#3968f6",
  "#ff893a",
  "#7adb12",
  "#8b5cf6",
  "#ff4570",
  "#22b8a6",
  "#f5b301",
  "#e0620d",
  "#5996ff",
  "#161616",
  "#b892ff",
  "#9aa0a6",
];
