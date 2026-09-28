const COOKIE = "dashboard_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function encoder() {
  return new TextEncoder();
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function sessionCookieName() {
  return COOKIE;
}

export function sessionMaxAge() {
  return MAX_AGE_SEC;
}

export async function createSessionValue(secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_SEC);
  const sig = await hmacHex(secret, exp);
  return `${exp}.${sig}`;
}

export async function verifySessionValue(value: string | undefined, secret: string): Promise<boolean> {
  if (!value || !secret) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = await hmacHex(secret, exp);
  if (!timingEqual(sig, expected)) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  return true;
}

export function checkPassword(input: string, expected: string): boolean {
  if (!expected) return false;
  return timingEqual(input, expected);
}
