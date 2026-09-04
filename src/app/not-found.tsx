import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="flex w-full max-w-[400px] flex-col gap-2.5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-semibold sm:text-[28px]">Not found</h1>
        <p className="mb-2 text-sm text-muted">That vendor page does not exist.</p>
        <Link className="btn-outline text-center no-underline" href="/ebay">
          Go to eBay
        </Link>
      </div>
    </div>
  );
}
