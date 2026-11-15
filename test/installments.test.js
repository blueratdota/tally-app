const assert = require('node:assert/strict');
const { installmentSchedule } = require('../netlify/functions/lib/installments');
const { computeCreditCard, monthlySpending } = require('../netlify/functions/lib/balances');

assert.deepEqual(installmentSchedule(100, '2026-01-31', 3), [
  { date: '2026-01-31', amount: 33.33 },
  { date: '2026-02-28', amount: 33.33 },
  { date: '2026-03-31', amount: 33.34 }
]);
assert.deepEqual(installmentSchedule(0.03, '2027-12-31', 3), [
  { date: '2027-12-31', amount: 0.01 },
  { date: '2028-01-31', amount: 0.01 },
  { date: '2028-02-29', amount: 0.01 }
]);
assert.equal(installmentSchedule(12000, '2026-11-15', 12).reduce((sum, t) => sum + t.amount, 0), 12000);

// Test the API boundary without touching Google Sheets.
const sheetPath = require.resolve('../netlify/functions/lib/sheets');
const accounts = [
  { id: 'cc', type: 'creditcard', cutoff_day: 15 },
  { id: 'sav', type: 'savings' },
  { id: 'old', type: 'creditcard', archived: true }
];
let written = [], batches = 0, singles = 0;
require.cache[sheetPath] = { id: sheetPath, filename: sheetPath, loaded: true, exports: {
  listAccounts: async () => accounts,
  commit: async ({ transactions = [] }) => { batches++; written.push(...transactions); },
  appendTransactions: async rows => { batches++; written.push(...rows); },
  appendTransaction: async tx => { singles++; written.push(tx); }
} };
process.env.APP_PASSCODE = 'test';
const { handler } = require('../netlify/functions/api');
const payload = { type: 'expense', date: '2026-01-31', amount: 100, description: 'Phone', person: 'p1', from_account_id: 'cc', category: 'Shopping', installments: 3 };
const post = body => handler({ httpMethod: 'POST', headers: { 'x-tally-passcode': 'test' }, queryStringParameters: { resource: 'transactions' }, body: JSON.stringify(body) });

(async () => {
  const res = await post(payload);
  assert.equal(res.statusCode, 200);
  const txs = JSON.parse(res.body).transactions;
  assert.equal(batches, 1);
  assert.equal(singles, 0);
  assert.equal(txs.length, 3);
  assert.equal(new Set(txs.map(t => t.id)).size, 3);
  assert.deepEqual(txs.map(t => t.description), ['Phone (1/3)', 'Phone (2/3)', 'Phone (3/3)']);
  assert(txs.every(t => t.from_account_id === 'cc' && t.person === 'p1' && t.category === 'Shopping' && t.type === 'expense'));
  const balance = computeCreditCard(accounts[0], txs, new Date(2026, 0, 31));
  assert.equal(balance.total, 33.33);
  assert.equal(balance.future, 66.67);
  assert.equal(balance.dueNextMonth, 33.33);
  assert.equal(monthlySpending(txs, '2026-02').total, 33.33);

  for (const patch of [
    { installments: 1 }, { installments: 121 }, { installments: 2.5 }, { installments: '3' },
    { amount: 0 }, { amount: 0.01 }, { amount: 1e20 }, { amount: 'Infinity' },
    { date: '2026-02-30' }, { date: 'invalid' },
    { from_account_id: 'sav' }, { from_account_id: 'missing' }, { from_account_id: 'old' },
    { type: 'income', to_account_id: 'sav' }
  ]) {
    const invalid = await post({ ...payload, ...patch });
    assert.equal(invalid.statusCode, 400, JSON.stringify(patch));
  }
  assert.equal(written.length, 3, 'invalid requests must not write rows');
  const normal = { ...payload }; delete normal.installments;
  assert.equal((await post(normal)).statusCode, 200);
  assert.equal(singles, 1, 'ordinary transactions still use the existing path');
  console.log('All installment checks passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
