const assert = require('node:assert/strict');

// Exercise the real API and Sheets writer against an in-memory Sheets API.
let data = {
  Accounts: [
    ['s', 'savings', 'Savings', '', '', '', '', false, 'p1'],
    ['s2', 'savings', 'Joint', '', '', '', '', false, 'shared'],
    ['l1', 'loan', 'Loan 1', 900, '', '', '', false, 'shared'],
    [],
    ['l2', 'loan', 'Loan 2', 500, '', '', '', false, 'p2'],
    ['old', 'savings', 'Archived', '', '', '', '', true, 'p1'],
    ['cc', 'creditcard', 'Card', '', 15, 5, '', false, 'p1']
  ],
  Plans: [], Goals: [], Settings: [],
  Transactions: [
    ['income', '2026-11-01', 'income', 1000, 'Salary', '', '', 's', false, 'p1'],
    [],
    ['expense', '2026-11-10', 'expense', 100, 'Groceries', 'Groceries', 's', '', false, 'p1'],
    ['payment', '2026-11-10', 'transfer', 100, 'Loan payment', '', 's', 'l1', false, 'p1'],
    ['archived', '2026-11-10', 'expense', 20, 'Old purchase', '', 'old', '', false, 'p1'],
    ['part', '2026-11-10', 'expense', 50, 'Phone (1/12)', 'Shopping', 'cc', '', false, 'p1'],
    ['part2', '2026-12-10', 'expense', 50, 'Phone (2/12)', 'Shopping', 'cc', '', false, 'p1']
  ]
};
const sheetsMeta = [{ properties: { title: 'Accounts', sheetId: 1 } }, { properties: { title: 'Transactions', sheetId: 2 } }, ...['Plans', 'Goals', 'Settings'].map((title, i) => ({ properties: { title, sheetId: i + 3 } }))];
let failBatch = false, batches = [];
const decodeCell = cell => Object.values(cell.userEnteredValue)[0];
const fake = { spreadsheets: {
  get: async () => ({ data: { sheets: sheetsMeta } }),
  values: {
    update: async () => ({}),
    get: async ({ range }) => ({ data: { values: structuredClone(data[range.split('!')[0]]) } }),
    append: async ({ range, requestBody }) => { data[range.split('!')[0]].push(...structuredClone(requestBody.values)); }
  },
  batchUpdate: async ({ requestBody }) => {
    if (failBatch) throw new Error('Storage unavailable');
    const next = structuredClone(data);
    for (const request of requestBody.requests) {
      if (request.appendCells) {
        const r = request.appendCells;
        const tab = sheetsMeta.find(s => s.properties.sheetId === r.sheetId).properties.title;
        next[tab].push(...r.rows.map(row => row.values.map(decodeCell)));
      } else {
        const r = request.updateCells;
        const tab = sheetsMeta.find(s => s.properties.sheetId === r.range.sheetId).properties.title;
        const row = next[tab][r.range.startRowIndex - 1];
        r.rows[0].values.forEach((cell, i) => { row[r.range.startColumnIndex + i] = decodeCell(cell); });
      }
    }
    data = next;
    batches.push(requestBody.requests);
  }
} };
const googlePath = require.resolve('googleapis');
require.cache[googlePath] = { id: googlePath, filename: googlePath, loaded: true, exports: { google: { auth: { JWT: class { async authorize() {} } }, sheets: () => fake } } };
process.env.APP_PASSCODE = 'test';
process.env.SHEET_ID = 'test-sheet';
const sheets = require('../netlify/functions/lib/sheets');
const { handler } = require('../netlify/functions/api');
const { computeSavingsBalance, computeCreditCard, monthlySpending } = require('../netlify/functions/lib/balances');
const read = async id => (await sheets.listTransactions()).find(t => t.id === id);
const loan = id => data.Accounts.find(row => row[0] === id)[3];
const post = body => handler({ httpMethod: 'POST', headers: { 'x-tally-passcode': 'test' }, queryStringParameters: { resource: 'transactions' }, body: JSON.stringify(body) });
const edit = (previous, patch = {}) => post({ ...previous, ...patch, action: 'update', id: previous.id, previous });

(async () => {
  const previous = await read('expense');
  assert.equal((await edit(previous, { amount: 150, from_account_id: 's2', person: 'p2', description: 'Corrected groceries' })).statusCode, 200);
  const updated = await read('expense');
  assert.equal(updated.id, previous.id);
  assert.equal(updated.amount, 150);
  assert.equal(data.Transactions[1].length, 0, 'blank sheet rows must not shift the target row');
  const audit = (await sheets.listTransactions()).find(t => t.id.startsWith('expense:revision:'));
  assert(audit.voided);
  assert.equal(audit.amount, 100);
  assert.equal(audit.description, 'Groceries');
  assert.equal(batches[0].length, 2, 'active row and audit copy use one batch');
  assert.equal(computeSavingsBalance('s', await sheets.listTransactions(), new Date(2026, 10, 20)), 900);
  assert.equal(computeSavingsBalance('s2', await sheets.listTransactions(), new Date(2026, 10, 20)), -150);
  assert.equal(monthlySpending(await sheets.listTransactions(), '2026-11').p2.total, 150);
  const saved = structuredClone(data);
  assert.equal((await edit(previous, { amount: 999 })).statusCode, 409);
  assert.deepEqual(data, saved, 'stale edits must not change money or audit rows');

  for (const patch of [
    { date: '2026-02-30' }, { date: '' }, { amount: true }, { amount: [1] }, { amount: 0.001 }, { amount: 1.234 }, { amount: 'Infinity' }, { amount: 1e20 },
    { description: '' }, { person: 'unknown' }, { from_account_id: 'missing' },
    { from_account_id: 'old' }, { installments: 3 }, { category: {} },
    { type: 'transfer', from_account_id: 's', to_account_id: 's' },
    { type: 'income', to_account_id: 'cc' }, { type: 'transfer', from_account_id: 'cc', to_account_id: 's' }
  ]) assert.equal((await edit(updated, patch)).statusCode, 400, JSON.stringify(patch));
  assert.deepEqual(data, saved);

  assert.equal((await edit(await read('archived'), { description: 'Archived account correction' })).statusCode, 200, 'unchanged archived account references remain editable');
  assert.equal((await edit(await read('part'), { amount: 40 })).statusCode, 200);
  assert.equal((await read('part2')).amount, 50, 'editing one installment must not change the others');
  const card = computeCreditCard({ id: 'cc', cutoff_day: 15 }, await sheets.listTransactions(), new Date(2026, 10, 20));
  assert.equal(card.total, 40);
  assert.equal(card.future, 50);

  assert.equal((await edit(await read('payment'), { amount: 140 })).statusCode, 200);
  assert.equal(loan('l1'), 860);
  assert.equal(batches.at(-1).length, 3, 'loan correction is in the same batch as the edit and audit');
  assert.equal((await edit(await read('payment'), { amount: 80, to_account_id: 'l2' })).statusCode, 200);
  assert.equal(loan('l1'), 1000);
  assert.equal(loan('l2'), 420);
  assert.equal((await edit(await read('payment'), { type: 'expense', amount: 30, category: 'Bills' })).statusCode, 200);
  assert.equal(loan('l2'), 500);
  assert.equal((await read('payment')).to_account_id, '', 'changing type clears irrelevant account fields');
  const beforeFailure = structuredClone(data);
  failBatch = true;
  assert.equal((await edit(await read('payment'), { type: 'transfer', amount: 200, to_account_id: 'l1' })).statusCode, 500);
  assert.deepEqual(data, beforeFailure, 'a failed write leaves the active row, audit history, and loans untouched');
  failBatch = false;
  assert.equal((await edit(await read('payment'), { type: 'transfer', amount: 200, to_account_id: 'l1' })).statusCode, 200);
  assert.equal(loan('l1'), 800);
  assert.equal((await post({ action: 'void', id: 'payment' })).statusCode, 200);
  assert.equal(loan('l1'), 1000, 'voiding an edited payment restores its loan');
  assert.equal((await post({ action: 'void', id: 'payment' })).statusCode, 200);
  assert.equal(loan('l1'), 1000, 'retrying void must not restore the payment twice');
  assert.equal((await edit(await read('payment'), { amount: 300 })).statusCode, 409);
  assert.equal((await post({ action: 'update', id: 'missing', previous: { id: 'missing' } })).statusCode, 404);

  const list = await handler({ httpMethod: 'GET', headers: { 'x-tally-passcode': 'test' }, queryStringParameters: { resource: 'transactions' } });
  assert(JSON.parse(list.body).transactions.every(t => !t.voided && !t.id.includes(':revision:')));
  assert.equal((await post({ type: 'income', date: '2026-11-15', amount: 50, description: 'Bonus', person: 'p1', to_account_id: 's', from_account_id: 's2' })).statusCode, 200);
  assert.equal(data.Transactions.at(-1)[6], '', 'income must not debit an injected source account');
  const today = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date(today + 'T12:00:00'); tomorrow.setDate(tomorrow.getDate() + 1);
  const next = tomorrow.toLocaleDateString('en-CA');
  const get = async resource => JSON.parse((await handler({ httpMethod: 'GET', headers: { 'x-tally-passcode': 'test' }, queryStringParameters: { resource } })).body);
  const resourcePost = (resource, body) => handler({ httpMethod: 'POST', headers: { 'x-tally-passcode': 'test' }, queryStringParameters: { resource }, body: JSON.stringify(body) });
  const { computeNetWorth } = require('../netlify/functions/lib/balances');
  const accountResult = await get('accounts');
  assert.deepEqual(accountResult.netWorthByView.p1, computeNetWorth((await sheets.listAccounts()).filter(a => a.owner === 'p1'), await sheets.listTransactions()), 'personal net worth must exclude all joint balances');

  const recurring = await post({ type: 'expense', date: today, amount: 49.95, description: 'Monthly subscription', category: 'Subscription', from_account_id: 's', person: 'p1', recurring: { frequency: 'monthly' } });
  assert.equal(recurring.statusCode, 200);
  const recurringPlan = JSON.parse(recurring.body).plan;
  assert.equal((await sheets.listTransactions()).filter(t => t.plan_id === recurringPlan.id).length, 1);
  await get('plans'); await get('plans');
  assert.equal((await sheets.listTransactions()).filter(t => t.plan_id === recurringPlan.id).length, 1, 'refresh must not duplicate due charges');
  const livePlan = (await get('plans')).plans.find(p => p.id === recurringPlan.id);
  assert.equal((await resourcePost('plans', { action: 'update', id: livePlan.id, previous: livePlan, amount: 55, next_date: next, frequency: 'weekly', end_date: '' })).statusCode, 200);
  assert.equal((await sheets.listTransactions()).find(t => t.plan_id === livePlan.id).amount, 49.95, 'changing recurrence must not rewrite past charges');
  assert.equal((await resourcePost('plans', { action: 'stop', id: livePlan.id })).statusCode, 200);
  assert.equal((await sheets.listRecords('Plans')).find(p => p.id === livePlan.id).active, false);
  assert.equal((await post({ type: 'expense', date: today, amount: 50, description: 'Invalid frequency', from_account_id: 's', person: 'p1', recurring: { frequency: 'random' } })).statusCode, 400);

  const inst = await post({ type: 'expense', date: today, amount: 100, description: 'Laptop', from_account_id: 'cc', person: 'p1', installments: 3 });
  assert.equal(inst.statusCode, 200);
  const instRows = JSON.parse(inst.body).transactions;
  const instPlan = (await get('plans')).plans.find(p => p.id === instRows[0].plan_id);
  assert(instPlan);
  const beforePlan = structuredClone(data);
  failBatch = true;
  assert.equal((await resourcePost('plans', { action: 'update', id: instPlan.id, previous: instPlan, amount: 20, next_date: next, remaining_count: 4 })).statusCode, 500);
  assert.deepEqual(data, beforePlan, 'failed plan changes must not void old future charges');
  failBatch = false;
  assert.equal((await resourcePost('plans', { action: 'update', id: instPlan.id, previous: instPlan, amount: 20, next_date: next, remaining_count: 4 })).statusCode, 200);
  const planCharges = (await sheets.listTransactions()).filter(t => !t.voided && t.plan_id === instPlan.id);
  assert.equal(planCharges.filter(t => t.date > today).length, 4);
  assert.equal(planCharges.filter(t => t.date > today).reduce((n, t) => n + t.amount, 0), 80);
  assert.equal(planCharges.find(t => t.date === today).amount, 33.33);
  assert((await sheets.listTransactions()).filter(t => instRows.slice(1).some(old => old.id === t.id)).every(t => t.voided));
  assert.equal((await resourcePost('plans', { action: 'update', id: instPlan.id, previous: instPlan, amount: 30, next_date: next, remaining_count: 2 })).statusCode, 409, 'stale plan edits are rejected');
  assert.equal((await resourcePost('plans', { action: 'stop', id: instPlan.id })).statusCode, 200);
  assert.equal((await sheets.listTransactions()).filter(t => !t.voided && t.plan_id === instPlan.id && t.date > today).length, 0);
  assert.equal((await resourcePost('plans', { action: 'link_installments', transaction_ids: ['part', 'part2'], description: 'Legacy phone' })).statusCode, 200);
  assert.equal((await sheets.listRecords('Plans')).find(p => p.description === 'Legacy phone').legacy_ids, 'part,part2');

  assert.equal((await post({ type: 'income', date: today, amount: 1000, description: 'Joint funding', person: 'p2', to_account_id: 's2' })).statusCode, 200);
  const nwBeforeGoals = (await get('accounts')).netWorthByView.all.netWorth;
  const goal = await resourcePost('goals', { name: 'Travel', account_id: 's2', target: 500, saved: 200 });
  assert.equal(goal.statusCode, 200); const g = JSON.parse(goal.body).goal;
  assert.equal((await resourcePost('goals', { name: 'Emergency', account_id: 's2', target: 600, saved: 300 })).statusCode, 200);
  assert.equal((await resourcePost('goals', { name: 'Too much', account_id: 's2', target: 1000, saved: 400 })).statusCode, 400);
  assert.equal((await get('accounts')).netWorthByView.all.netWorth, nwBeforeGoals, 'goals cannot create or double-count money');
  assert.equal((await resourcePost('goals', { action: 'archive', id: g.id })).statusCode, 200);
  assert.equal((await get('goals')).goals.some(goal => goal.id === g.id), false);

  const current = computeSavingsBalance('s2', await sheets.listTransactions());
  for (const invalid of ['', true, null, 1.234]) assert.equal((await resourcePost('accounts', { action: 'adjust_balance', id: 's2', balance: invalid, previous_balance: current, person: 'p2' })).statusCode, 400);
  const adjust = await resourcePost('accounts', { action: 'adjust_balance', id: 's2', balance: current - 50, previous_balance: current, person: 'p2', category: 'Shopping' });
  assert.equal(adjust.statusCode, 200);
  assert.equal(JSON.parse(adjust.body).transaction.type, 'expense');
  assert.equal(JSON.parse(adjust.body).transaction.category, 'Shopping');
  assert.equal(computeSavingsBalance('s2', await sheets.listTransactions()), current - 50);
  assert.equal((await resourcePost('accounts', { action: 'adjust_balance', id: 's2', balance: 0, previous_balance: current, person: 'p2', category: 'Other' })).statusCode, 409);
  assert.equal((await resourcePost('accounts', { action: 'adjust_balance', id: 's2', balance: current + 50, previous_balance: current - 50, person: 'p2' })).statusCode, 200);
  assert.equal(computeSavingsBalance('s2', await sheets.listTransactions()), current + 50);

  const csvRow = { type: 'income', date: today, amount: 5, description: 'CSV income', person: 'p1', to_account_id: 's' };
  const existingRow = await read('expense');
  const preview = await post({ action: 'import_preview', rows: [existingRow, csvRow, { ...csvRow, date: 'bad' }] });
  assert.equal(preview.statusCode, 200);
  const checks = JSON.parse(preview.body).preview;
  assert(checks[0].duplicate); assert(!checks[1].duplicate); assert(checks[2].error);
  const importBefore = structuredClone(data);
  assert.equal((await post({ action: 'import', rows: [csvRow, { ...csvRow, date: 'bad' }] })).statusCode, 400);
  assert.deepEqual(data, importBefore, 'invalid imports must not write any rows');
  const imported = await post({ action: 'import', rows: [existingRow, csvRow] });
  assert.equal(JSON.parse(imported.body).imported, 1); assert.equal(JSON.parse(imported.body).skipped, 1);
  assert.equal(JSON.parse((await post({ action: 'import', rows: [csvRow] })).body).imported, 0);
  const refund = await post({ action: 'import', rows: [{ type: 'expense', date: today, amount: -10, description: 'Refund', from_account_id: 'cc', person: 'p1' }] });
  assert.equal(refund.statusCode, 200); assert.equal(JSON.parse(refund.body).imported, 1);
  const loanBeforeImport = loan('l1');
  assert.equal((await post({ action: 'import', rows: [{ type: 'transfer', date: today, amount: 25, description: 'Imported payment', from_account_id: 's', to_account_id: 'l1', person: 'p1' }] })).statusCode, 200);
  assert.equal(loan('l1'), loanBeforeImport - 25);

  assert.equal((await resourcePost('settings', { names: { p1: 'Alex', p2: 'Sam' } })).statusCode, 200);
  assert.deepEqual((await get('settings')).names, { p1: 'Alex', p2: 'Sam' });
  assert.equal((await resourcePost('settings', { names: { p1: 'Alex', p2: 'alex' } })).statusCode, 400);
  assert.equal((await read('income')).person, 'p1', 'renaming never changes ownership IDs');
  console.log('All plans, future-charge edits, goal reservations, balance adjustments, duplicate-reviewed imports, shared-balance exclusion, and saved-name checks passed.');
  console.log('All transaction edit, audit, loan correction, and atomic-write checks passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
