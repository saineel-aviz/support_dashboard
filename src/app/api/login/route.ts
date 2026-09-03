import { NextResponse } from "next/server";
import { checkPassword, createSessionValue, sessionCookieName, sessionMaxAge } from "@/lib/auth";

export async function POST(request: Request) {
  const password = process.env.DASHBOARD_PASSWORD || "";
  const secret = process.env.DASHBOARD_SESSION_SECRET || "";
  if (!password || !secret) {
    return NextResponse.json({ error: "Dashboard auth is not configured" }, { status: 500 });
  }

  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!checkPassword(body.password || "", password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const value = await createSessionValue(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge(),
  });
  return res;
}
