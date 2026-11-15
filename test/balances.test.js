const assert = require('assert');
const {
  lastCutoffDate,
  computeSavingsBalance,
  computeCreditCard,
  computeNetWorth,
  monthlySpending,
  netWorthHistory
} = require('../netlify/functions/lib/balances');
const { passcodeOk } = require('../netlify/functions/lib/passcode');

// --- lastCutoffDate: month-rollover and short-month clamping ---
let d = lastCutoffDate(15, new Date(2026, 0, 20)); // Jan 20, cutoff 15 -> Jan 15
assert.strictEqual(d.getMonth(), 0);
assert.strictEqual(d.getDate(), 15);

d = lastCutoffDate(15, new Date(2026, 0, 10)); // Jan 10, cutoff 15 -> Dec 15 prior year
assert.strictEqual(d.getFullYear(), 2025);
assert.strictEqual(d.getMonth(), 11);
assert.strictEqual(d.getDate(), 15);

d = lastCutoffDate(31, new Date(2026, 1, 5)); // Feb 5, cutoff 31 -> Jan 31 (Feb clamps, doesn't roll to Mar)
assert.strictEqual(d.getMonth(), 0);
assert.strictEqual(d.getDate(), 31);

// --- savings balance ---
const savingsTxs = [
  { type: 'income', amount: 1000, to_account_id: 'sav1', from_account_id: null, date: '2026-01-01', voided: false },
  { type: 'expense', amount: 200, from_account_id: 'sav1', to_account_id: null, date: '2026-01-05', voided: false },
  { type: 'expense', amount: 9999, from_account_id: 'sav1', to_account_id: null, date: '2026-01-06', voided: true } // voided, ignored
];
assert.strictEqual(computeSavingsBalance('sav1', savingsTxs), 800);

// --- credit card: billed vs unbilled split, payment reduces current first ---
const card = { id: 'cc1', type: 'creditcard', cutoff_day: 15 };
const today = new Date(2026, 0, 25); // Jan 25 -> last cutoff Jan 15
const cardTxs = [
  { type: 'expense', amount: 100, from_account_id: 'cc1', date: '2026-01-10', voided: false }, // before cutoff
  { type: 'expense', amount: 50, from_account_id: 'cc1', date: '2026-01-20', voided: false }    // after cutoff
];
let result = computeCreditCard(card, cardTxs, today);
assert.strictEqual(result.current, 100);
assert.strictEqual(result.outstanding, 50);
assert.strictEqual(result.total, 150);

// a payment of 120 should wipe out `current` (100) and spill 20 into outstanding
const paidTxs = [...cardTxs, { type: 'transfer', amount: 120, to_account_id: 'cc1', from_account_id: 'sav1', date: '2026-01-16', voided: false }];
result = computeCreditCard(card, paidTxs, today);
assert.strictEqual(result.current, 0);
assert.strictEqual(result.outstanding, 30); // 50 - 20 spillover

// --- future-dated charges (installments) stay out of today's debt, shown as `future` ---
const futureTxs = [...cardTxs,
  { type: 'expense', amount: 40, from_account_id: 'cc1', date: '2026-02-10', voided: false },  // next month
  { type: 'expense', amount: 60, from_account_id: 'cc1', date: '2026-04-10', voided: false }]; // later
result = computeCreditCard(card, futureTxs, today);
assert.strictEqual(result.total, 150);
assert.strictEqual(result.future, 100);
assert.strictEqual(result.dueNextMonth, 40);
assert.strictEqual(computeSavingsBalance('sav1', [...savingsTxs,
  { type: 'expense', amount: 500, from_account_id: 'sav1', date: '2026-12-01', voided: false }], today), 800);

// --- net worth combines all three account types ---
const accounts = [
  { id: 'sav1', type: 'savings', archived: false },
  { id: 'cc1', type: 'creditcard', cutoff_day: 15, archived: false },
  { id: 'loan1', type: 'loan', balance: 500000, archived: false }
];
const nw = computeNetWorth(accounts, cardTxs.concat(savingsTxs), today);
// savings: 800, cardDebt: 150, loanDebt: 500000
assert.strictEqual(nw.savings, 800);
assert.strictEqual(nw.cardDebt, 150);
assert.strictEqual(nw.loanDebt, 500000);
assert.strictEqual(nw.netWorth, round(800 - 150 - 500000));

function round(n) { return Math.round(n * 100) / 100; }

// --- monthly spending per person: only expenses, only that month, voided skipped ---
const sp = monthlySpending([
  { type: 'expense', amount: 100, person: 'p1', category: 'Dining', date: '2026-11-02' },
  { type: 'expense', amount: 50.5, person: 'p1', category: 'Dining', date: '2026-11-20' },
  { type: 'expense', amount: 30, person: 'p2', category: '', date: '2026-11-03' },
  { type: 'expense', amount: 999, person: 'p2', date: '2026-10-31' },            // other month
  { type: 'expense', amount: 999, person: 'p1', date: '2026-11-05', voided: true },
  { type: 'income', amount: 999, person: 'p1', date: '2026-11-05' }              // not an expense
], '2026-11');
assert.strictEqual(sp.total, 180.5);
assert.strictEqual(sp.p1.total, 150.5);
assert.strictEqual(sp.p1.categories.Dining, 150.5);
assert.strictEqual(sp.p2.categories.Other, 30);

// --- passcode: exact match only, fails closed when unset ---
assert.strictEqual(passcodeOk({ headers: { 'x-tally-passcode': 'abc' } }, 'abc'), true);
assert.strictEqual(passcodeOk({ headers: { 'x-tally-passcode': 'abcd' } }, 'abc'), false);
assert.strictEqual(passcodeOk({ headers: {} }, 'abc'), false);
assert.strictEqual(passcodeOk({ headers: { 'x-tally-passcode': '' } }, ''), false);

console.log('All balance checks passed.');

// --- net worth history: one point per month-end, current month = today ---
{
  const accts = [{ id: 's', type: 'savings' }];
  const txs = [
    { type: 'income', amount: 100, to_account_id: 's', date: '2026-01-10' },
    { type: 'income', amount: 50, to_account_id: 's', date: '2026-03-02' },
    { type: 'income', amount: 999, to_account_id: 's', date: '2026-03-20' } // after "today": excluded
  ];
  const h = netWorthHistory(accts, txs, 3, new Date(2026, 2, 15));
  assert.deepStrictEqual(h, [
    { month: '2026-01', netWorth: 100 }, { month: '2026-02', netWorth: 100 }, { month: '2026-03', netWorth: 150 }
  ]);
}
