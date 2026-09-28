import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6">
      <p className="eyebrow">404</p>
      <h1 className="font-display text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="btn-outline mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}
