const DEFAULT_BASE = "https://api.devrev.ai";

export class DevRevError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function devrevFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const pat = process.env.DEVREV_PAT;
  const base = (process.env.DEVREV_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  if (!pat) {
    throw new DevRevError("DEVREV_PAT is not set", 500);
  }

  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  let attempt = 0;
  while (true) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });

    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("Retry-After") || "2");
      await sleep(Math.min(30, (Number.isFinite(retryAfter) ? retryAfter : 2) * 1000) + attempt * 250);
      attempt += 1;
      continue;
    }
    return res;
  }
}

export async function listAllTickets(accountIds: string[]): Promise<unknown[]> {
  if (!accountIds.length) {
    throw new DevRevError("No DevRev account IDs configured for this vendor", 500);
  }

  const works: unknown[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const maxPages = 50;

  do {
    const body: Record<string, unknown> = {
      type: ["ticket"],
      limit: 100,
      ticket: { account: accountIds },
    };
    if (cursor) body.cursor = cursor;

    let res = await devrevFetch("/works.list", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (res.status === 400 || res.status === 404 || res.status === 405 || res.status === 415) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.append("type", "ticket");
      accountIds.forEach((id) => params.append("ticket.account", id));
      if (cursor) params.set("cursor", cursor);
      res = await devrevFetch(`/works.list?${params.toString()}`, { method: "GET" });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new DevRevError(`DevRev works.list failed (${res.status}): ${text.slice(0, 400)}`, res.status);
    }

    const json = (await res.json()) as { works?: unknown[]; next_cursor?: string };
    works.push(...(json.works ?? []));
    cursor = json.next_cursor;
    pages += 1;
  } while (cursor && pages < maxPages);

  return works;
}

/** Newest timeline comment date for a work object, or null if none. */
export async function getLastCommentDate(objectId: string): Promise<string | null> {
  const bodies: Record<string, unknown>[] = [
    { object: objectId, type: ["timeline_comment"], limit: 1, sort_by: ["created_date:desc"] },
    { object: objectId, limit: 10, sort_by: ["created_date:desc"] },
  ];

  for (const body of bodies) {
    const res = await devrevFetch("/timeline-entries.list", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) continue;
    const json = (await res.json()) as { timeline_entries?: Array<Record<string, unknown>> };
    const entries = json.timeline_entries ?? [];
    for (const entry of entries) {
      const type = typeof entry.type === "string" ? entry.type : "";
      if (type && type !== "timeline_comment" && !type.includes("comment")) continue;
      const created = typeof entry.created_date === "string" ? entry.created_date : null;
      if (created) return created;
    }
    // First body filtered to comments; if empty, try unfiltered next.
    if (body.type) continue;
  }
  return null;
}

/** Fill lastCommentDate on open tickets with bounded concurrency. */
export async function attachLastCommentDates<T extends { id: string; isOpen: boolean; lastCommentDate: string | null }>(
  tickets: T[],
  concurrency = 8,
): Promise<T[]> {
  const open = tickets.filter((t) => t.isOpen);
  let i = 0;

  async function worker() {
    while (i < open.length) {
      const idx = i++;
      const t = open[idx];
      try {
        t.lastCommentDate = await getLastCommentDate(t.id);
      } catch {
        t.lastCommentDate = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, open.length)) }, () => worker());
  await Promise.all(workers);
  return tickets;
}
