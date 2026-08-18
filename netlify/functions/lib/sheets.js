const { google } = require('googleapis');

const SHEET_ID = process.env.SHEET_ID;
const ACCOUNTS_TAB = 'Accounts';
const TX_TAB = 'Transactions';

// Column order — keep in sync with the header row created in setupSheet().
const ACCOUNTS_COLS = ['id', 'type', 'name', 'balance', 'cutoff_day', 'due_day', 'logo_url', 'archived'];
const TX_COLS = ['id', 'date', 'type', 'amount', 'description', 'category', 'from_account_id', 'to_account_id', 'voided'];

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
  await auth.authorize();
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
  return obj;
}

function objectToRow(obj, cols) {
  return cols.map(c => (obj[c] === undefined || obj[c] === null ? '' : obj[c]));
}

// Ensures both tabs exist with a header row. Safe to call every time —
// it's a couple of cheap reads, not a heavy migration step.
async function ensureSheetsExist() {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTabs = meta.data.sheets.map(s => s.properties.title);

  const toCreate = [];
  if (!existingTabs.includes(ACCOUNTS_TAB)) toCreate.push(ACCOUNTS_TAB);
  if (!existingTabs.includes(TX_TAB)) toCreate.push(TX_TAB);

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
}

async function listAccounts() {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A2:H` });
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
    spreadsheetId: SHEET_ID, range: `${ACCOUNTS_TAB}!A${rowNum}:H${rowNum}`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [objectToRow(merged, ACCOUNTS_COLS)] }
  });
  return merged;
}

async function listTransactions() {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TX_TAB}!A2:I` });
  return (res.data.values || []).map(r => rowToObject(r, TX_COLS)).filter(t => t.id);
}

async function appendTransaction(tx) {
  await ensureSheetsExist();
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TX_TAB}!A2`, valueInputOption: 'USER_ENTERED',
    requestBody: { values: [objectToRow(tx, TX_COLS)] }
  });
}

async function voidTransaction(id) {
  const sheets = await getSheetsClient();
  const txs = await listTransactions();
  const idx = txs.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Transaction not found');
  const rowNum = idx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TX_TAB}!I${rowNum}`, valueInputOption: 'RAW',
    requestBody: { values: [[true]] }
  });
}

module.exports = {
  listAccounts, appendAccount, updateAccount,
  listTransactions, appendTransaction, voidTransaction,
  ACCOUNTS_COLS, TX_COLS
};
