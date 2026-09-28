import { NextResponse } from "next/server";
import { CLOSED_STAGE_IDS, EBAY_ACCOUNT_ID } from "@/config/rma";
import { DevRevError, listAllTickets } from "@/lib/devrev/client";
import { mapWorkToTicket } from "@/lib/devrev/map-ticket";
import { isRmaTicket, toRmaTicket } from "@/lib/rma/classify";
import type { DashboardPayload, DashboardTicket, RmaTicket } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseAccountIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isEbayTicket(t: DashboardTicket, accountKeys: Set<string>): boolean {
  if (accountKeys.size && accountKeys.has(t.accountKey)) return true;
  if (/^ebay$/i.test(t.accountName.trim())) return true;
  if (t.accountKey === EBAY_ACCOUNT_ID) return true;
  return false;
}

export async function GET() {
  // Prefer full DevRev account don: IDs in DEVREV_ACCOUNT_IDS when available.
  // Display ids (e.g. FlInn3gv) are not accepted by works.list — fall back to
  // org-wide fetch and filter by account display_id / name.
  const accountIds = parseAccountIds(process.env.DEVREV_ACCOUNT_IDS);
  const useApiFilter = accountIds.some((id) => id.includes(":") || id.startsWith("don"));
  const displayKeys = new Set(
    accountIds.filter((id) => !id.includes(":") && !id.startsWith("don")).concat(EBAY_ACCOUNT_ID),
  );

  try {
    const works = await listAllTickets(useApiFilter ? accountIds.filter((id) => id.includes(":") || id.startsWith("don")) : []);
    const mapped = works
      .map((w) => mapWorkToTicket(w, CLOSED_STAGE_IDS))
      .filter((t): t is DashboardTicket => Boolean(t));

    const ebay = useApiFilter ? mapped : mapped.filter((t) => isEbayTicket(t, displayKeys));

    const tickets = ebay
      .filter(isRmaTicket)
      .map(toRmaTicket)
      .filter((t): t is RmaTicket => Boolean(t))
      .sort((a, b) => b.date.localeCompare(a.date));

    const payload: DashboardPayload = {
      vendor: "ebay-rma",
      generatedAt: new Date().toISOString(),
      tickets,
      sourceCount: ebay.length,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const status = err instanceof DevRevError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Failed to load tickets";
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
