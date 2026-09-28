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

/**
 * List tickets from DevRev. When accountIds is empty, fetches all tickets (CSM org-wide).
 * Optional accountIds narrows to those accounts (comma-separated env).
 */
export async function listAllTickets(accountIds: string[] = []): Promise<unknown[]> {
  const works: unknown[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const maxPages = 80;

  do {
    const body: Record<string, unknown> = {
      type: ["ticket"],
      limit: 100,
    };
    if (accountIds.length) {
      body.ticket = { account: accountIds };
    }
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
