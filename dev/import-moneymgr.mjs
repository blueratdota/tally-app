// One-off import of a Money Manager export (already converted to JSON rows).
//   node dev/import-moneymgr.mjs rows.json seed.json          dry run: summary + seed file, writes nothing
//   SEED_FILE=seed.json npm run local                         preview it in the app (in-memory)
//   node --env-file=.env dev/import-moneymgr.mjs rows.json seed.json --write   push to the real Google Sheet
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const { computeNetWorth, computeSavingsBalance, computeCreditCard } = require('../netlify/functions/lib/balances.js');

const [rowsFile, seedFile] = process.argv.slice(2);
const write = process.argv.includes('--write');

const CARDS = { 'EW MC CC': 12, 'RCBC VISA': 3, 'BDO VISA CC': 29, 'BOC MC CC': 3, 'UB VISA': 15, 'RCBC MC': 9 };
const OLD_CARD = 'BPI MC CC'; // no longer exists: kept as an archived card so its history survives
// Current balances the user wants Tally to show today. The export's history already sums to these
// (to the centavo, apart from a small gap), so we only add a correcting entry for the difference.
const TARGET = { 'BOC Debit': 0, GCash: 343.28, MariBank: 433383.02, BanKo: 0, 'BPI Debit': 18539.91 };
const OWNER = 'p1', PERSON = 'p1';
// ponytail: placeholder due day = cutoff + 25 days wrapped into a 30-day month; the user edits real ones in the app.
const dueDay = c => ((c + 25 - 1) % 30) + 1;
// Money Manager category -> Tally category (emoji stripped; Food/House fold into existing ones).
const FOLD = { Food: 'Dining', House: 'Home', 'Modified Bal.': 'Balance adjustment', None: 'Other' };
const cleanCat = s => { const c = String(s ?? '').replace(/^[^\p{L}]+/u, '').trim(); return FOLD[c] ?? (c || 'Other'); };

const rows = JSON.parse(readFileSync(rowsFile, 'utf8'));
const names = new Set(rows.flatMap(r => [r.Accounts, r.Category && r['Income/Expense'] === 'Transfer-Out' ? r.Category : null]).filter(Boolean));

const accounts = [...names].map(name => {
  const card = name in CARDS || name === OLD_CARD;
  const cutoff = CARDS[name] ?? 1; // archived BPI card: placeholder, never shown
  return {
    id: crypto.randomUUID(), type: card ? 'creditcard' : 'savings', name, balance: '',
    cutoff_day: card ? cutoff : '', due_day: card ? dueDay(cutoff) : '', logo_url: '',
    archived: name === OLD_CARD, owner: OWNER
  };
});
const byName = Object.fromEntries(accounts.map(a => [a.name, a]));

const txs = [], skipped = [];
for (const r of rows) {
  const kind = r['Income/Expense'];
  if (kind === 'Transfer-In') continue; // each transfer appears twice; Transfer-Out carries both accounts
  const amount = Number(r.Amount), date = String(r.Period).slice(0, 10), cat = cleanCat(r.Category);
  const from = kind === 'Income' ? '' : byName[r.Accounts]?.id;
  const to = kind === 'Income' ? byName[r.Accounts]?.id : kind === 'Transfer-Out' ? byName[r.Category]?.id : '';
  const type = { 'Exp.': 'expense', Income: 'income', 'Transfer-Out': 'transfer' }[kind];
  // negative expenses are refunds/reversals; balances.js sums them naturally
  const ok = type && (type === 'expense' ? amount !== 0 : amount > 0) && (type === 'income' ? to : type === 'expense' ? from : from && to);
  if (!ok) { skipped.push(r); continue; }
  txs.push({
    id: crypto.randomUUID(), date, type, amount,
    description: String(r.Note || r.Description || (type === 'transfer' ? 'Transfer' : cat)).trim(),
    category: type === 'transfer' ? '' : cat, from_account_id: from || '', to_account_id: to || '',
    voided: false, person: PERSON
  });
}

const first = txs.reduce((m, t) => (t.date < m ? t.date : m), '9999');
for (const [name, target] of Object.entries(TARGET)) {
  const gap = Math.round((target - computeSavingsBalance(byName[name].id, txs)) * 100) / 100;
  if (gap) txs.push({ id: crypto.randomUUID(), date: first, type: gap > 0 ? 'income' : 'expense', amount: Math.abs(gap),
    description: 'Opening balance adjustment', category: 'Balance adjustment',
    from_account_id: gap > 0 ? '' : byName[name].id, to_account_id: gap > 0 ? byName[name].id : '', voided: false, person: PERSON });
}
txs.sort((a, b) => a.date.localeCompare(b.date));

// --- summary ---
const today = new Date();
console.log(`accounts ${accounts.length}, transactions ${txs.length}, skipped ${skipped.length}`);
if (skipped.length) console.log('skipped examples:', skipped.slice(0, 3));
console.log('\nsavings balances today (opening balance + history):');
for (const a of accounts.filter(a => a.type === 'savings')) console.log(' ', a.name.padEnd(10), computeSavingsBalance(a.id, txs, today).toFixed(2));
console.log('\ncards (current billed / not yet billed / upcoming):');
for (const a of accounts.filter(a => a.type === 'creditcard' && !a.archived)) {
  const c = computeCreditCard(a, txs, today);
  console.log(' ', a.name.padEnd(12), `cutoff ${a.cutoff_day} due ${a.due_day}`.padEnd(16), c.current.toFixed(2), '/', c.outstanding.toFixed(2), '/', c.future.toFixed(2));
}
console.log('\nnet worth:', computeNetWorth(accounts, txs, today));

writeFileSync(seedFile, JSON.stringify({ accounts, transactions: txs }));
console.log('\nseed written to', seedFile);

if (write) {
  const db = require('../netlify/functions/lib/sheets.js');
  if ((await db.listAccounts()).length || (await db.listTransactions()).length) throw new Error('Sheet already has data; refusing to import on top of it.');
  for (const a of accounts) await db.appendAccount(a);
  await db.appendTransactions(txs);
  console.log('WROTE to Google Sheet.');
} else console.log('Dry run: nothing written to the Google Sheet. Add --write to import.');
