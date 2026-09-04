import type { DashboardTicket } from "../dashboard/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function nestStr(obj: Record<string, unknown> | null, ...keys: string[]): string | null {
  let cur: unknown = obj;
  for (const key of keys) {
    const rec = asRecord(cur);
    if (!rec) return null;
    cur = rec[key];
  }
  return str(cur);
}

function lastSegment(id: string): string {
  const parts = id.split(/[/:]/);
  return parts[parts.length - 1] || id;
}

function normalizeSeverity(raw: string | null): "blocker" | "high" | "medium" | "low" {
  const v = (raw ?? "medium").toLowerCase();
  if (v === "blocker" || v === "critical") return "blocker";
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "medium";
}

function extractSubtype(work: Record<string, unknown>): string {
  const direct = str(work.subtype);
  if (direct) return lastSegment(direct);
  const nested = nestStr(work, "subtype", "id") || nestStr(work, "subtype", "name");
  if (nested) return lastSegment(nested);
  const spec = nestStr(asRecord(work.custom_schema_spec), "subtype");
  if (spec) return lastSegment(spec);
  return "";
}

function extractAccount(work: Record<string, unknown>): { key: string; name: string } {
  const account = asRecord(work.account);
  const revOrg = asRecord(work.rev_org);
  const key =
    nestStr(account, "display_id") ||
    nestStr(account, "id") ||
    nestStr(revOrg, "display_id") ||
    nestStr(revOrg, "id") ||
    "_none";
  const name =
    nestStr(account, "display_name") ||
    nestStr(account, "name") ||
    nestStr(revOrg, "display_name") ||
    nestStr(revOrg, "name") ||
    (key === "_none" ? "(no account)" : key);
  return { key: lastSegment(key), name };
}

function extractStage(work: Record<string, unknown>): { key: string; name: string } {
  const stage = asRecord(work.stage);
  const inner = asRecord(stage?.stage);
  const id =
    nestStr(inner, "id") ||
    nestStr(stage, "id") ||
    nestStr(work, "stage_id") ||
    "";
  const name =
    nestStr(inner, "name") ||
    nestStr(stage, "name") ||
    nestStr(work, "stage_name") ||
    id;
  const key = id ? lastSegment(id) : name;
  return { key, name };
}

function customFields(work: Record<string, unknown>): Record<string, unknown> {
  return asRecord(work.custom_fields) || {};
}

function stringifyCustom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  const rec = asRecord(value);
  if (rec) return str(rec.label) || str(rec.name) || str(rec.value) || str(rec.display_name);
  if (Array.isArray(value) && value.length) return stringifyCustom(value[0]);
  return null;
}

function pickCustom(work: Record<string, unknown>, needles: string[]): string | null {
  const fields = customFields(work);
  const keys = Object.keys(fields);
  for (const needle of needles) {
    const hit = keys.find((k) => k.toLowerCase().includes(needle));
    if (hit) {
      const v = stringifyCustom(fields[hit]);
      if (v) return v;
    }
  }
  return null;
}

const HW_VENDORS = ["Arista", "Aviz", "Celestica", "Cisco", "Dell", "Edgecore", "Nvidia", "Wistron"];

function normalizeSupportLevel(raw: string | null): string {
  if (!raw) return "(none)";
  const v = raw.trim();
  if (/^vendor$/i.test(v) || v === "L3") return "L3";
  if (/l3\s*internal/i.test(v)) return "L3 Internal";
  if (/^l1$/i.test(v)) return "L1";
  if (/^l2$/i.test(v)) return "L2";
  if (/none|unset|n\/a/i.test(v)) return "(none)";
  return v;
}

function extractHardwareVendor(work: Record<string, unknown>, title: string): string {
  const fromField = pickCustom(work, ["hardware_vendor", "hw_vendor", "hardware vendor", "oem", "vendor"]);
  if (fromField) {
    const named = HW_VENDORS.find((n) => fromField.toLowerCase().includes(n.toLowerCase()));
    return named || fromField;
  }
  const tags = work.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      const rec = asRecord(tag);
      const name = nestStr(asRecord(rec?.tag), "name") || stringifyCustom(tag);
      if (!name) continue;
      const named = HW_VENDORS.find((n) => name.toLowerCase().includes(n.toLowerCase()));
      if (named) return named;
    }
  }
  const named = HW_VENDORS.find((n) => title.toLowerCase().includes(n.toLowerCase()));
  return named || "(none)";
}

function extractOwner(work: Record<string, unknown>): string {
  const owners = work.owned_by;
  if (Array.isArray(owners) && owners.length) {
    const rec = asRecord(owners[0]);
    return nestStr(rec, "display_name") || nestStr(rec, "full_name") || "Unassigned";
  }
  return "Unassigned";
}

function extractPriorityLabel(work: Record<string, unknown>): string {
  const v2 = asRecord(work.priority_v2);
  const label = nestStr(v2, "label") || str(work.priority);
  if (!label) return "(none)";
  const pretty = label.replace(/^p/i, "").trim();
  if (/urgent|p0|blocker/i.test(label)) return "Urgent";
  if (/high|p1/i.test(label)) return "High";
  if (/medium|p2/i.test(label)) return "Medium";
  if (/low|p3/i.test(label)) return "Low";
  return pretty || "(none)";
}

function extractSolvedDate(work: Record<string, unknown>): string | null {
  const stock =
    str(work.actual_close_date) ||
    str(work.closed_date) ||
    str(work.resolved_date) ||
    nestStr(work, "actual_close_date") ||
    null;
  if (stock) return stock;

  const fromCustom =
    pickCustom(work, [
      "tnt__solved_date",
      "solved_date",
      "solved date",
      "resolution_date",
      "resolved_date",
      "closed_date",
      "actual_close",
    ]) || null;
  if (fromCustom && /^\d{4}-\d{2}/.test(fromCustom)) return fromCustom;

  // Direct key lookup for tenant custom fields DevRev often returns as tnt__*
  const fields = customFields(work);
  for (const key of Object.keys(fields)) {
    if (!/solved_date|resolved_date|closed_date|actual_close/i.test(key)) continue;
    const v = stringifyCustom(fields[key]);
    if (v && /^\d{4}-\d{2}/.test(v)) return v;
  }
  return null;
}

export function mapWorkToTicket(work: unknown, closedStageIds: string[]): DashboardTicket | null {
  const rec = asRecord(work);
  if (!rec) return null;
  const displayId = str(rec.display_id) || str(rec.id);
  if (!displayId) return null;
  const id = str(rec.id) || displayId;
  const title = str(rec.title) || "(untitled)";
  const product = extractSubtype(rec);
  const account = extractAccount(rec);
  const stage = extractStage(rec);
  const severity = normalizeSeverity(str(rec.severity) || nestStr(rec, "severity", "value"));
  const createdDate = str(rec.created_date);
  const actualCloseDate = extractSolvedDate(rec);
  const modifiedDate = str(rec.modified_date);

  // Match reference HTML: Solved/Resolved = configured closed stage ids (44, 19) or those names.
  const isSolvedStage =
    closedStageIds.includes(stage.key) || /^(solved|resolved)$/i.test(stage.name);
  const stageState = asRecord(asRecord(rec.stage)?.state);
  const finalState = Boolean(stageState?.is_final) && /^(solved|resolved|closed)$/i.test(str(stageState?.name) || "");
  const isOpen = !(isSolvedStage || finalState);

  const ownerName = extractOwner(rec);
  const supportLevel = normalizeSupportLevel(pickCustom(rec, ["support_level", "support level", "escalation"]));
  const hardwareVendor = extractHardwareVendor(rec, title);
  const priorityLabel = extractPriorityLabel(rec);

  return {
    id,
    displayId,
    title,
    product,
    accountKey: account.key,
    accountName: account.name,
    stageKey: stage.key,
    stageName: stage.name,
    severity,
    createdDate,
    actualCloseDate,
    modifiedDate,
    lastCommentDate: null,
    isOpen,
    isSolvedStage,
    supportLevel,
    hardwareVendor,
    ownerName,
    priorityLabel,
  };
}
