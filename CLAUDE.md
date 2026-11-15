# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tally is a money dashboard for a two-person household: credit cards (with cutoff/due dates), loans, multiple savings accounts, a live net worth view, and monthly spending per person. Access is gated by one shared household passcode (`APP_PASSCODE`); there are no per-user accounts.

Architecture:
```
React app (Vite build)  →  Netlify Functions  →  Google Sheets API   (all financial data)
                                              →  Cloudinary API       (card logo images)
```

Google Sheets is the actual database (via a service account) — there is no other persistence layer. The `Accounts` and `Transactions` tabs are created automatically on first run.

## Commands

- `npm run dev` — Vite dev server only (UI only; API calls fail with nothing to answer them)
- `npm run local` — Vite + the real function handlers without the Netlify CLI (`dev/local.mjs`, reads `.env`; template in `.env.example`). With `SHEET_ID` set it uses the real Google Sheet; without it, `sheets.js` is swapped for an in-memory store (data resets on restart, passcode `demo`). Logo upload works only when the Cloudinary vars are set.
- `netlify dev` — runs the React app and Netlify Functions together (needs Netlify CLI + a local `.env` — see Environment below); use this to exercise real app behavior end-to-end
- `npm run build` — Vite production build
- `npm test` — runs `test/balances.test.js` directly with `node` (plain `assert`-based, no test framework/runner). To run it: `node test/balances.test.js`

## Environment variables

Required (in Netlify site config or a local `.env` for `netlify dev`):
`APP_PASSCODE`, `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. If `APP_PASSCODE` is unset, every API call is refused (fails closed).

## Architecture

**Backend (`netlify/functions/`)** — two functions, both of which first check the `x-tally-passcode` header via `lib/passcode.js` (constant-time compare, returns 401):
- `api.js` — single handler routing on `?resource=accounts|transactions`, dispatching by `event.httpMethod` and a `body.action` field (`create` is the default action; `update`/`archive`/`void` are explicit). All validation happens inline here before touching the sheet.
- `upload-logo.js` — accepts a base64 data URI, uploads to Cloudinary under `tally-card-logos`, returns the secure URL.
- `lib/sheets.js` — the only place that talks to Google Sheets. Row↔object mapping is column-order-based (`ACCOUNTS_COLS`, `TX_COLS` arrays) — if you add a field, update the relevant COLS array and keep it in sync with the header row logic in `ensureSheetsExist()`. Updates/voids work by re-finding the row by scanning `listAccounts()`/`listTransactions()` and overwriting that row — there's no row-id-to-row-number index.
- `lib/balances.js` — **pure functions only** (no network/sheet calls), computing every derived balance from raw accounts + transactions. This separation is what makes `test/balances.test.js` possible without mocking Sheets. Key logic:
  - Savings balance = sum of transactions in/out of that account.
  - Loan balance is the one *stored* (not derived) field — manually set, and auto-decremented when a `transfer` targets a loan account (see `api.js`'s post-append step in `handleTransactions`).
  - Credit card debt splits into `current` (billed as of the last cutoff date, due next) vs `outstanding` (spent since cutoff, not yet billed). Payments reduce `current` first, then spill into `outstanding`. `lastCutoffDate()` clamps to the actual last day of short months (e.g. cutoff day 31 in February).

**Frontend (`src/`)** — React + TypeScript (no router, no state library), UI built from shadcn/ui components (`src/components/ui/`, Tailwind v3, added with `shadcn@2.3.0` — the last CLI release for Tailwind v3):
- `App.tsx` owns all top-level state (accounts, transactions, net worth per view, active page, open modals); pages are shadcn `Tabs`. The Both/Person 1/Person 2 switch is purely client-side — `GET accounts` returns `netWorthByView` for all three views at once, so switching never refetches.
- `lib/api.ts` — typed fetch wrapper (and the `Account`/`Transaction`/… types) around the two Netlify functions; every call returns `data` and throws `ApiError` on `!data.success`.
- `lib/format.ts` — `peso()` currency formatter and the fixed `CATEGORIES` list for expenses (edit this array to change categories — it's not stored in the sheet).
- Styling is Tailwind; colors are shadcn tokens (`primary`, `destructive`, `muted-foreground`, …) whose values (the Tally palette) live as CSS variables in `src/index.css`.
- `npm run typecheck` runs `tsc`. The backend (`netlify/functions/`) stays plain JavaScript.

## Data model notes

- Every balance is *calculated* from the transaction ledger except loans (manually-set, then adjusted by payments) — the Sheet is always the source of truth and can be inspected directly.
- Transactions are never edited or deleted — `void` sets a `voided` flag and the row stays for audit purposes; `balances.js` and `api.js` both filter voided transactions out.
- Accounts are never deleted — `archive` sets an `archived` flag; archived accounts are excluded from the accounts list, net worth, and dashboard.
- Two people are fixed as `p1`/`p2` (display names live in `PEOPLE` in `src/lib/format.js`, so renaming never touches the sheet). Accounts have an `owner` (`p1`/`p2`/`shared`, column I); transactions have a `person` (`p1`/`p2`, column J) — both appended after the original columns so `voided` stays in column I of Transactions.
- `GET ?resource=accounts&month=YYYY-MM` also returns `spending` from `monthlySpending()` in `balances.js` (expenses per person and category). The client sends its local month so the Philippines/UTC offset doesn't shift the month boundary.
