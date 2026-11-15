const assert = require('node:assert/strict');
const original = [['original', '2026-01-01', 'income', 123, 'Original row', '', '', 's', false, 'p1']];
const writes = [], added = [];
const meta = [{ properties: { title: 'Accounts', sheetId: 1 } }, { properties: { title: 'Transactions', sheetId: 2 } }];
const fake = { spreadsheets: {
  get: async () => ({ data: { sheets: meta } }),
  batchUpdate: async ({ requestBody }) => { for (const r of requestBody.requests) if (r.addSheet) { added.push(r.addSheet.properties.title); meta.push({ properties: { title: r.addSheet.properties.title, sheetId: meta.length + 1 } }); } },
  values: { get: async () => ({ data: { values: structuredClone(original) } }), update: async args => { writes.push(args); } }
} };
const path = require.resolve('googleapis');
require.cache[path] = { id: path, filename: path, loaded: true, exports: { google: { auth: { JWT: class { async authorize() {} } }, sheets: () => fake } } };
process.env.SHEET_ID = 'test';
(async () => {
  const db = require('../netlify/functions/lib/sheets');
  const tx = await db.listTransactions();
  assert.deepEqual(added.sort(), ['Goals', 'Plans', 'Settings']);
  assert(writes.every(w => w.range === 'Transactions!K1' || /^(Plans|Goals|Settings)!A1$/.test(w.range)), 'migration only writes new header cells');
  assert.equal(tx[0].id, 'original'); assert.equal(tx[0].amount, 123); assert.equal(tx[0].plan_id, '');
  assert.equal(db.TX_COLS[8], 'voided'); assert.equal(db.TX_COLS[9], 'person');
  assert.deepEqual(db.TX_COLS.slice(10), ['plan_id', 'plan_index']);
  console.log('All non-destructive schema migration checks passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
