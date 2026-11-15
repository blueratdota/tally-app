# Tally — household money dashboard

Tracks credit cards (with cutoff/due dates), loans, multiple savings accounts,
and a live net worth view. React + Tailwind frontend (built with Vite),
Netlify Functions backend, Google Sheets as the database, Cloudinary for
card logo images.

```
React app (Vite build)  →  Netlify Functions  →  Google Sheets API   (all financial data)
                                              →  Cloudinary API       (card logo images)
```

No login — anyone with the site link can use it, same as before.

---

## Part 1 — Google Sheet + service account (10 min)

Unlike the old version, this does **not** use Apps Script. Instead, a
"service account" (a robot Google account) gets permission to edit your
Sheet directly.

1. Create a new blank Google Sheet at [sheets.google.com](https://sheets.google.com).
   Name it anything (e.g. "Tally Data"). The app will create the `Accounts`
   and `Transactions` tabs automatically the first time it runs — you don't
   need to set up columns yourself.
2. Copy the **Sheet ID** from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`
3. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a new project (or use an existing one) — it's free.
4. In that project, go to **APIs & Services > Library**, search for
   **Google Sheets API**, and click **Enable**.
5. Go to **APIs & Services > Credentials > Create Credentials > Service account**.
   Give it any name (e.g. "tally-backend"). You don't need to grant it any
   project-level roles — skip that step.
6. Open the new service account, go to the **Keys** tab, **Add Key > Create
   new key > JSON**. This downloads a `.json` file — keep it private, don't
   commit it anywhere public.
7. Open that JSON file. You need two values from it:
   - `client_email` — looks like `tally-backend@your-project.iam.gserviceaccount.com`
   - `private_key` — a long string starting with `-----BEGIN PRIVATE KEY-----`
8. Back in your Google Sheet, click **Share**, and share it with the
   `client_email` address from step 7, giving it **Editor** access. This is
   the step that actually lets the backend write to your sheet.

## Part 2 — Cloudinary account (2 min)

1. Sign up free at [cloudinary.com](https://cloudinary.com).
2. On your Cloudinary dashboard home page, copy: **Cloud name**, **API Key**,
   **API Secret**.

## Part 3 — Deploy to Netlify with environment variables

This has a real build step now (Vite bundles the React app, Tailwind compiles
the CSS), so use Netlify's Git-based deploy, not drag-and-drop:

1. Push this whole folder to a new GitHub repo.
2. In Netlify: **Add new site > Import an existing project**, pick the repo.
3. Build settings: Netlify reads `netlify.toml` automatically —
   **Build command**: `npm run build`, **Publish directory**: `dist`,
   functions from `netlify/functions`. You shouldn't need to change anything
   here.
4. Before deploying, go to **Site configuration > Environment variables** and
   add:

   | Key | Value |
   |---|---|
   | `SHEET_ID` | the Sheet ID from Part 1 step 2 |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from Part 1 step 7 |
   | `GOOGLE_PRIVATE_KEY` | the `private_key` from Part 1 step 7 (paste it exactly, including the `-----BEGIN/END-----` lines) |
   | `CLOUDINARY_CLOUD_NAME` | from Part 2 |
   | `CLOUDINARY_API_KEY` | from Part 2 |
   | `CLOUDINARY_API_SECRET` | from Part 2 |

5. Deploy. Netlify will run `npm install` for the functions automatically.
6. Open your new Netlify URL — the Dashboard should load with zero accounts
   and zero transactions (that's expected on a fresh sheet).

**Want to test locally first?** Run `npm install`, add the same variables to
a `.env` file, and:
- `npm run dev` — just the React app (Vite), fastest for UI tweaks, but API
  calls will fail with nothing to answer them.
- `netlify dev` (needs the [Netlify CLI](https://docs.netlify.com/cli/get-started/))
  — runs the React app *and* the functions together, so the app is fully
  working locally.

---

## Using it

- **+ button** (bottom right): add **Income** (goes into a savings account),
  **Expense** (charged to a savings account or a credit card), or **Transfer**
  (from a savings account to another savings account, a credit card payment,
  or a loan payment).
- **Credit Cards tab**: add a card with its cutoff and due day, optionally
  upload a logo image. "Due now" is the billed statement amount; "Outstanding"
  is what you've spent since the last cutoff, not billed yet. Paying a card
  (via Transfer) pays down "Due now" first, then "Outstanding."
- **Loans tab**: set a balance, edit it any time. Paying a loan via Transfer
  automatically reduces its balance too.
- **Savings tab**: add as many accounts as you want; balance is just
  income/transfers in minus expenses/transfers out.
- **Transactions tab**: edit the date, amount, description, person, category,
  type, or accounts. Each edit keeps a voided copy of the previous version in
  the Sheet, with a revision ID linked to the active entry. Edits and loan
  balance corrections are saved in one Sheets batch. Void reverses an entry
  without deleting it. Editing one installment charge leaves the rest alone.
- **Insights tab**: choose Combined or an individual to filter charts and
  tables. Shared-account activity follows the person tagged on the transaction.
- **Dashboard**: live net worth = all savings − all credit card debt (billed
  + unbilled) − all loan balances.

## Notes & limitations

- **No authentication** — same as before, anyone with the link can use it.
- **Net worth history** is reconstructed from the ledger; loan history uses
  today's manually maintained balance.
- **Categories** for expenses are a fixed list in `src/lib/format.js`
  (`export const CATEGORIES = [...]`) — edit that array to change them.
- **Individual views** exclude joint account balances; Combined includes all
  active accounts. Transaction attribution still follows the tagged person.
- Every balance is *calculated* from the transaction ledger (except loans,
  which are a manually-set field) — so the Sheet itself is always the
  source of truth. You can inspect it directly any time.

## Household tools

- In **Expense**, choose **Repeat this expense** and a frequency (daily,
  weekly, fortnightly, monthly, quarterly, or yearly), with an optional end
  date. Due entries catch up when the app opens, refreshes, or returns to the
  foreground. This records activity in Tally; it does not make bank payments.
- **Manage schedules** (calendar icon): see recurring expenses and installment
  plans. Change future installment amounts, dates, and remaining counts, or
  stop future entries. Already-posted entries stay intact. Use **Link existing
  installment entries** to review and connect older imported charges.
- **Transactions**: search and combine date, account, category, person, type,
  and posted/scheduled filters. **Export filtered CSV** exports all matching
  entries, including those beyond the displayed page. **Import CSV** supports
  column mapping, ISO/US/day-first dates, signed amounts or debit/credit
  columns, preview, and explicit duplicate inclusion. Import up to 1,000 rows
  per batch. CSV exports contain the ledger, not goals/settings/plan metadata.
- **Savings > Adjust balance** records the difference as income or an expense;
  choose the person and expense category. It never overwrites ledger history.
- **Savings goals** reserve money inside savings accounts without adding to
  net worth. Combined reservations cannot exceed the account balance when
  saved. If later spending reduces that balance, a shortfall warning appears.
- **Household settings** (gear icon) saves both display names in Sheets. Stable
  p1/p2 IDs preserve all transaction and account ownership links.
- New Plans, Goals, and Settings tabs and two transaction metadata columns are
  created automatically. Existing transaction columns and rows are retained.
