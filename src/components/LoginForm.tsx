"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not sign in");
        return;
      }
      router.replace(params.get("from") || "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <form
        className="flex w-full max-w-[400px] flex-col gap-2.5 rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8"
        onSubmit={onSubmit}
      >
        <p className="eyebrow">eBay RMA · Support analytics</p>
        <h1 className="font-display text-2xl font-semibold sm:text-[28px]">Sign in</h1>
        <p className="mb-2 text-sm text-body">Enter the shared dashboard password.</p>
        <label htmlFor="password" className="font-mono-ui text-[11px] uppercase tracking-[0.05em] text-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded-xl border-[1.5px] border-line bg-grey px-3 py-2.5 text-[17px] outline-none focus:border-dark sm:text-[15px]"
        />
        {error ? <p className="text-[13px] text-red-500">{error}</p> : null}
        <button type="submit" className="btn-outline mt-2 min-h-11" disabled={busy}>
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
