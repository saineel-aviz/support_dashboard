# eBay RMA Dashboard

Password-protected dashboard for eBay hardware RMA tickets. Loads live data from the [DevRev Works API](https://developer.devrev.ai/api-reference/works/list) on every visit and on **Refresh**. Period filters (all time / year / quarter / month / custom) run in the browser.

## Local setup

1. Copy env template and fill in values (never commit `.env.local`):

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DEVREV_PAT` | DevRev personal access token (`Authorization: Bearer …`) |
| `DEVREV_API_BASE` | Defaults to `https://api.devrev.ai` |
| `DEVREV_ACCOUNT_IDS` | eBay account id (default `FlInn3gv`) |
| `DASHBOARD_PASSWORD` | Shared password for the login page |
| `DASHBOARD_SESSION_SECRET` | Random 32+ character string used to sign the login cookie |

```bash
openssl rand -hex 32
```

2. Install and run:

```bash
npm install
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000), sign in, then use **Refresh** to re-fetch from DevRev.

RMA tickets are selected from eBay works whose title matches RMA / DOA patterns. Switch vendor and SKU are classified from title text and hardware-vendor custom fields.
