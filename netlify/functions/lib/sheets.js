const { google } = require('googleapis');
const crypto = require('crypto');
const { round2 } = require('./balances');

const SHEET_ID = process.env.SHEET_ID;
const ACCOUNTS_TAB = 'Accounts';
const TX_TAB = 'Transactions';

// Column order — keep in sync with the header row created in setupSheet().
const ACCOUNTS_COLS = ['id', 'type', 'name', 'balance', 'cutoff_day', 'due_day', 'logo_url', 'archived', 'owner'];
const TX_COLS = ['id', 'date', 'type', 'amount', 'description', 'category', 'from_account_id', 'to_account_id', 'voided', 'person', 'plan_id', 'plan_index'];

const TABLES = {
  Plans: ['id', 'kind', 'account_id', 'person', 'amount', 'description', 'category', 'start_date', 'frequency', 'end_date', 'count', 'active', 'legacy_ids'],
  Goals: ['id', 'account_id', 'name', 'target', 'saved', 'archived'],
  Settings: ['id', 'value']
};
let cachedClient = null;

async function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  try {
    await auth.authorize();
  } catch (err) {
    throw new Error('Google sign-in failed. Check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY. (' + err.message + ')');
  }
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

function rowToObject(row, cols) {
  const obj = {};
  cols.forEach((col, i) => { obj[col] = row[i] ?? ''; });
  obj.amount = obj.amount !== '' ? Number(obj.amount) : undefined;
  obj.balance = obj.balance !== '' ? Number(obj.balance) : undefined;
  obj.cutoff_day = obj.cutoff_day !== '' ? Number(obj.cutoff_day) : undefined;
  obj.due_day = obj.due_day !== '' ? Number(obj.due_day) : undefined;
  obj.archived = obj.archived === 'TRUE' || obj.archived === true;
  obj.voided = obj.voided === 'TRUE' || obj.voided === true;
  for (const key of ['target', 'saved', 'count', 'plan_index']) if (key in obj && obj[key] !== '') obj[key] = Number(obj[key]);
  if ('active' in obj) obj.active = obj.active === 'TRUE' || obj.active === true;
  return obj;
}

function objectToRow(obj, cols) {
  return cols.map(c => (obj[c] === undefined || obj[c] === null ? '' : obj[c]));
}

// Ensures both tabs exist with a header row. Runs once per process: callers
// share one promise, so parallel reads on a brand-new sheet don't both try
// to create the tabs. Retries on the next call if it failed.
// ponytail: separate cold-started function instances could still race on the very first run.
let ensured = null;
function ensureSheetsExist() {
  return (ensured ??= createMissingTabs().catch(err => { ensured = null; throw err; }));
}

async function createMissingTabs() {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTabs = meta.data.sheets.map(s => s.properties.title);

  const toCreate = [];
  if (!existingTabs.includes(ACCOUNTS_TAB)) toCreate.push(ACCOUNTS_TAB);
  if (!existingTabs.includes(TX_TAB)) toCreate.push(TX_TAB);
  for (const tab of Object.keys(TABLES)) if (!existingTabs.includes(tab)) toCreate.push(tab);

  if (toCreate.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) }
    });
  }
  if (!existingTabs.includes(ACCOUNTS_TAB)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A1`, valueInputOption: 'RAW',
      requestBody: { values: [ACCOUNTS_COLS] }
    });
  }
  if (!existingTabs.includes(TX_TAB)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TX_TAB}!A1`, valueInputOption: 'RAW',
      requestBody: { values: [TX_COLS] }
    });
  }
  // Only the new header cells are written on existing ledgers; old rows stay intact.
  if (existingTabs.includes(TX_TAB)) await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TX_TAB}!K1`, valueInputOption: 'RAW', requestBody: { values: [TX_COLS.slice(10)] }
  });
  for (const [tab, cols] of Object.entries(TABLES)) if (!existingTabs.includes(tab)) await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${tab}!A1`, valueInputOption: 'RAW', requestBody: { values: [cols] }
  });

}

async function listAccounts() {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A2:I` });
  return (res.data.values || []).map(r => rowToObject(r, ACCOUNTS_COLS)).filter(a => a.id);
}

async function appendAccount(account) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A2`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [objectToRow(account, ACCOUNTS_COLS)] }
  });
}

// Finds the account's sheet row and overwrites it with the merged fields.
async function updateAccount(id, patch) {
  const sheets = await getSheetsClient();
  const accounts = await listAccounts();
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Account not found');
  const merged = { ...accounts[idx], ...patch };
  const rowNum = idx + 2; // +2: header row + 1-indexing
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A${rowNum}:I${rowNum}`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [objectToRow(merged, ACCOUNTS_COLS)] }
  });
  return merged;
}

async function listTransactions() {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TX_TAB}!A2:L` });
  return [...new Map((res.data.values || []).filter(r => r[0]).map(r => { const tx = rowToObject(r, TX_COLS); return [tx.id, tx]; })).values()];
}

async function appendTransaction(tx) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TX_TAB}!A2`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [objectToRow(tx, TX_COLS)] }
  });
}

// One API call for many rows (used by the Money Manager import; per-row appends would hit Sheets' write quota).
async function appendTransactions(txs) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TX_TAB}!A2`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: txs.map(t => objectToRow(t, TX_COLS)) }
  });
}

function cellData(value) {
  return { userEnteredValue: typeof value === 'number' ? { numberValue: value } : typeof value === 'boolean' ? { boolValue: value } : { stringValue: String(value ?? '') } };
}

async function updateTransaction(id, replacement, previous) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const [txData, accountData, meta] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TX_TAB}!A2:L` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A2:I` }),
    sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  ]);
  const txRows = txData.data.values || [], accountRows = accountData.data.values || [];
  const idx = txRows.findIndex(row => row[0] === id);
  if (idx === -1) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
  const original = rowToObject(txRows[idx], TX_COLS);
  if (original.voided) {
    if (!replacement) return; // Voiding twice must not restore a loan payment twice.
    throw Object.assign(new Error('This transaction has been voided. Refresh your data.'), { statusCode: 409 });
  }
  if (replacement && (!previous || TX_COLS.some(c => c !== 'voided' && String(original[c] ?? '') !== String(previous[c] ?? '')))) {
    throw Object.assign(new Error('This transaction changed since you opened it. Refresh before editing.'), { statusCode: 409 });
  }
  const sheetId = title => meta.data.sheets.find(s => s.properties.title === title).properties.sheetId;
  const requests = txRows.flatMap((row, i) => row[0] !== id ? [] : [{ updateCells: {
    range: { sheetId: sheetId(TX_TAB), startRowIndex: i + 1, endRowIndex: i + 2, startColumnIndex: 0, endColumnIndex: TX_COLS.length },
    rows: [{ values: objectToRow(replacement || { ...original, voided: true }, TX_COLS).map(cellData) }], fields: 'userEnteredValue'
  } }]);
  if (replacement) requests.push({ appendCells: {
    sheetId: sheetId(TX_TAB), rows: [{ values: objectToRow({ ...original, id: `${id}:revision:${crypto.randomUUID()}`, voided: true }, TX_COLS).map(cellData) }], fields: 'userEnteredValue'
  } });
  const deltas = new Map();
  for (const [tx, sign] of [[original, 1], [replacement, -1]]) {
    if (tx?.type !== 'transfer') continue;
    const accountIdx = accountRows.findIndex(row => row[0] === tx.to_account_id);
    if (accountIdx === -1 || accountRows[accountIdx][1] !== 'loan') continue;
    deltas.set(accountIdx, (deltas.get(accountIdx) || 0) + sign * Number(tx.amount));
  }
  // The active row, audit copy, and loan adjustments succeed or fail in one Sheets batch.
  for (const [accountIdx, delta] of deltas) {
    if (!delta) continue;
    const balance = round2(Number(accountRows[accountIdx][3]) + delta);
    if (!Number.isFinite(balance)) throw new Error('The loan has an invalid stored balance');
    requests.push({ updateCells: {
      range: { sheetId: sheetId(ACCOUNTS_TAB), startRowIndex: accountIdx + 1, endRowIndex: accountIdx + 2, startColumnIndex: 3, endColumnIndex: 4 },
      rows: [{ values: [cellData(balance)] }], fields: 'userEnteredValue'
    } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
}

async function voidTransaction(id) {
  await updateTransaction(id, null);
}

async function listRecords(table) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${table}!A2:Z` });
  return (res.data.values || []).filter(r => r[0]).map(r => rowToObject(r, TABLES[table]));
}

// Related writes succeed together.
// shortcut: separate Sheets requests can race; use transactional storage if simultaneous writers become common.
async function commit({ transactions = [], records = [], voidIds = [] }) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const tables = [...new Set([TX_TAB, ACCOUNTS_TAB, ...records.map(r => r.table)])];
  const [meta, ...responses] = await Promise.all([
    sheets.spreadsheets.get({ spreadsheetId: SHEET_ID }),
    ...tables.map(table => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${table}!A2:Z` }))
  ]);
  const rows = Object.fromEntries(tables.map((t, i) => [t, responses[i].data.values || []]));
  const sheetId = t => meta.data.sheets.find(s => s.properties.title === t).properties.sheetId;
  const requests = [];
  const write = (table, idx, cols, record) => ({ updateCells: {
    range: { sheetId: sheetId(table), startRowIndex: idx + 1, endRowIndex: idx + 2, startColumnIndex: 0, endColumnIndex: cols.length },
    rows: [{ values: objectToRow(record, cols).map(cellData) }], fields: 'userEnteredValue'
  } });
  const append = (table, cols, objects) => ({ appendCells: { sheetId: sheetId(table), rows: objects.map(o => ({ values: objectToRow(o, cols).map(cellData) })), fields: 'userEnteredValue' } });
  const existing = new Set(rows[TX_TAB].map(r => r[0]));
  const fresh = transactions.filter(t => !existing.has(t.id));
  const removed = new Map();
  rows[TX_TAB].forEach((row, i) => {
    if (!voidIds.includes(row[0])) return;
    const tx = rowToObject(row, TX_COLS);
    if (!tx.voided) removed.set(tx.id, tx);
    requests.push(write(TX_TAB, i, TX_COLS, { ...tx, voided: true }));
  });
  for (const { table, record, previous } of records) {
    const cols = TABLES[table];
    if (!cols) throw new Error('Invalid record table');
    const idx = rows[table].findIndex(r => r[0] === record.id);
    if (previous && (idx < 0 || cols.some(c => String(rowToObject(rows[table][idx], cols)[c] ?? '') !== String(previous[c] ?? '')))) throw Object.assign(new Error('This item changed. Refresh before saving.'), { statusCode: 409 });
    requests.push(idx < 0 ? append(table, cols, [record]) : write(table, idx, cols, record));
  }
  if (fresh.length) requests.push(append(TX_TAB, TX_COLS, fresh));
  const deltas = new Map();
  for (const [tx, sign] of [...fresh.map(t => [t, -1]), ...[...removed.values()].map(t => [t, 1])]) {
    if (tx.type !== 'transfer') continue;
    const idx = rows[ACCOUNTS_TAB].findIndex(r => r[0] === tx.to_account_id && r[1] === 'loan');
    if (idx >= 0) deltas.set(idx, (deltas.get(idx) || 0) + sign * Number(tx.amount));
  }
  for (const [idx, delta] of deltas) {
    const account = rowToObject(rows[ACCOUNTS_TAB][idx], ACCOUNTS_COLS);
    const balance = round2(Number(account.balance) + delta);
    if (!Number.isFinite(balance)) throw new Error('Invalid loan balance');
    requests.push(write(ACCOUNTS_TAB, idx, ACCOUNTS_COLS, { ...account, balance }));
  }
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
}

module.exports = {
  listAccounts, appendAccount, updateAccount,
  listTransactions, appendTransaction, appendTransactions, updateTransaction, voidTransaction,
  listRecords, commit, TABLES,
  ACCOUNTS_COLS, TX_COLS
};
