import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Not found</h1>
        <p className="login-copy">That vendor page does not exist.</p>
        <Link className="reset" href="/ebay" style={{ textAlign: "center", textDecoration: "none" }}>
          Go to eBay
        </Link>
      </div>
    </div>
  );
}
