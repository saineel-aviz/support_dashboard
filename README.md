# Product support dashboard

Internal, password-protected dashboard for product support tickets. The eBay page loads live data from the [DevRev Works API](https://developer.devrev.ai/api-reference/works/list) on every visit and on **Refresh**. Filters (year, product, stage, severity, sprint range) run in the browser and do not call DevRev again.

Add another vendor later by extending `src/config/vendors.ts` and adding an account-id env var — the `/[vendor]` page and header tabs pick it up automatically.

## Local setup

1. Copy env template and fill in values (never commit `.env.local`):

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DEVREV_PAT` | DevRev personal access token (`Authorization: Bearer …`) |
| `DEVREV_API_BASE` | Defaults to `https://api.devrev.ai` |
| `DEVREV_EBAY_ACCOUNT_IDS` | eBay account DON or display id (comma-separated if more than one). Used as `ticket.account` on `works.list`. |
| `DASHBOARD_PASSWORD` | Shared password for the login page |
| `DASHBOARD_SESSION_SECRET` | Random 32+ character string used to sign the login cookie |

Generate a session secret:

```bash
openssl rand -hex 32
```

2. Install and run:

```bash
npm install
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000), sign in, then use **Refresh** in the header to re-fetch from DevRev.

## Deploy on Vercel (Hobby / free)

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new). Framework preset: Next.js.
3. Add the same environment variables as `.env.example` in **Project → Settings → Environment Variables** (Production and Preview).
4. Deploy. Share the Vercel URL and `DASHBOARD_PASSWORD` internally.

The DevRev token stays on the server (`/api/dashboard/[vendor]`). The browser never sees `DEVREV_PAT`.
