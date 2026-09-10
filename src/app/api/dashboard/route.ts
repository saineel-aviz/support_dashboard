import { NextResponse } from "next/server";
import { getVendor, parseAccountIds } from "@/config/vendors";
import { DevRevError, attachLastCommentDates, listAllTickets } from "@/lib/devrev/client";
import { mapWorkToTicket } from "@/lib/devrev/map-ticket";
import type { DashboardPayload, DashboardTicket } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("vendor") || "";
  const vendor = getVendor(slug);
  if (!vendor) {
    return NextResponse.json({ error: "Unknown vendor" }, { status: 404 });
  }

  const accountIds = parseAccountIds(process.env[vendor.envAccountIdsKey]);
  try {
    const works = await listAllTickets(accountIds);
    let tickets = works
      .map((w) => mapWorkToTicket(w, vendor.closedStageIds))
      .filter((t): t is DashboardTicket => Boolean(t));

    tickets = await attachLastCommentDates(tickets);

    const payload: DashboardPayload = {
      vendor: vendor.slug,
      generatedAt: new Date().toISOString(),
      tickets,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const status = err instanceof DevRevError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Failed to load tickets";
    return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
