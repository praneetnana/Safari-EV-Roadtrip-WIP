# The Ledger — Personal Budget Dashboard

A self-contained, editorial-style personal budget dashboard built from your monthly spreadsheet history. Hostable on GitHub Pages (or anywhere that serves static files).

## What's inside

- `index.html` — the dashboard
- `styles.css` — editorial newspaper styling
- `app.js` — application logic (charts, entry form, import/export)
- `data.json` — your historical budget data (104 months: Sep 2017 → Jun 2026), extracted from `Praneet_Budget_MAIN.xlsx`

## Tabs

- **Overview** — latest month at a glance, deltas vs. 12-month average, lifetime totals, allocation doughnut.
- **Trends** — income / fixed / surplus over time, savings rate, annual totals. Toggle 12m / 24m / 5y / all.
- **History** — full sortable ledger of every month. Search by year. Click _edit_ to load a row into the entry form.
- **Add Month** — form to enter a new month or revise an old one. Live calculation of fixed / disposable / surplus.
- **Data** — export your data (JSON), import a previous backup, clear local edits.

## How it stays up to date

- New months added via the **Add Month** tab are saved in your browser's `localStorage`.
- They show up everywhere immediately (with a small `·local` tag in the History table).
- To make those edits permanent in the GitHub repo, go to **Data → Download JSON**, rename the file to `data.json`, and commit it back to your repo. Then you can clear local edits if you want a clean slate.

## Hosting on GitHub Pages

1. Create a new public repository on GitHub (e.g. `ledger`).
2. Upload `index.html`, `styles.css`, `app.js`, and `data.json` to the root of the repo.
3. In **Settings → Pages**, set the Source to the `main` branch, root folder. Save.
4. Wait ~1 minute, then visit `https://<your-username>.github.io/ledger/`.

## Run locally

Any static file server works. Quickest:

```bash
cd budget-dashboard
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Extracted data notes

The extractor read the `Income`, `Total Fixed`, `Disposable`, `Surplus`, and the eight allocation categories (Savings, Retirement, Spending, Petrol, Medical Aid, Car Maintenance, Holiday, Clothing) from each monthly sheet, where they were laid out in columns A and B. A handful of older sheets with non-standard layouts were skipped — if any month is missing, just add it via the **Add Month** form.
