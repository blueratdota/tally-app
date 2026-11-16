// Local server: Vite + the real Netlify function handlers, no Netlify CLI needed.
//   npm run local   (reads .env if present)
// With SHEET_ID set it talks to your real Google Sheet; without it, it uses an
// in-memory store (data resets on restart, passcode "demo").
import { createRequire } from 'module';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);

const offline = !process.env.SHEET_ID;
if (offline) {
  process.env.APP_PASSCODE ??= 'demo';
  // SEED_FILE=path.json (from dev/import-moneymgr.mjs) preloads the in-memory store.
  const seed = process.env.SEED_FILE ? JSON.parse((await import('fs')).readFileSync(process.env.SEED_FILE, 'utf8')) : {};
  const accounts = seed.accounts ?? [], txs = seed.transactions ?? [];
  const records = { Plans: seed.plans ?? [], Goals: seed.goals ?? [], Settings: seed.settings ?? [] };
  const mock = {
    listRecords: async table => records[table].map(r => ({ ...r })),
    commit: async ({ transactions = [], records: changes = [], voidIds = [] }) => {
      const nextTx = txs.map(t => ({ ...t })), nextAccounts = accounts.map(a => ({ ...a }));
      const nextRecords = Object.fromEntries(Object.entries(records).map(([key, rows]) => [key, rows.map(r => ({ ...r }))]));
      const removed = nextTx.filter(t => !t.voided && voidIds.includes(t.id));
      for (const t of nextTx) if (voidIds.includes(t.id)) t.voided = true;
      const ids = new Set(nextTx.map(t => t.id));
      const fresh = transactions.filter(t => { if (ids.has(t.id)) return false; ids.add(t.id); return true; });
      for (const { table, record, previous } of changes) {
        const rows = nextRecords[table], idx = rows.findIndex(r => r.id === record.id);
        if (previous && (idx < 0 || Object.keys(record).some(k => k !== 'next_date' && String(rows[idx][k] ?? '') !== String(previous[k] ?? '')))) throw Object.assign(new Error('This item changed. Refresh before saving.'), { statusCode: 409 });
        if (idx < 0) rows.push({ ...record }); else rows[idx] = { ...record };
      }
      for (const [t, sign] of [...fresh.map(t => [t, -1]), ...removed.map(t => [t, 1])]) {
        const loan = t.type === 'transfer' && nextAccounts.find(a => a.id === t.to_account_id && a.type === 'loan');
        if (loan) { loan.balance = Math.round((Number(loan.balance) + sign * Number(t.amount) + Number.EPSILON) * 100) / 100; if (!Number.isFinite(loan.balance)) throw new Error('Invalid loan balance'); }
      }
      nextTx.push(...fresh.map(t => ({ ...t })));
      txs.splice(0, txs.length, ...nextTx); accounts.splice(0, accounts.length, ...nextAccounts);
      Object.assign(records, nextRecords);
    },
    listAccounts: async () => accounts.map(a => ({ ...a })),
    appendAccount: async a => { accounts.push({ ...a, archived: false }); },
    updateAccount: async (id, patch) => {
      const a = accounts.find(x => x.id === id);
      if (!a) throw new Error('Account not found');
      return Object.assign(a, patch);
    },
    listTransactions: async () => txs.map(t => ({ ...t })),
    appendTransaction: async t => { txs.push({ ...t, voided: false }); },
    appendTransactions: async rows => { txs.push(...rows.map(t => ({ ...t, voided: false }))); },
    updateTransaction: async (id, replacement, previous, shareNote = { ids: [], note: '' }) => {
      const current = txs.find(t => t.id === id);
      if (!current) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
      if (current.voided) {
        if (!replacement) return;
        throw Object.assign(new Error('This transaction has been voided. Refresh your data.'), { statusCode: 409 });
      }
      const fields = ['id', 'date', 'type', 'amount', 'description', 'category', 'from_account_id', 'to_account_id', 'person', 'plan_id', 'plan_index'];
      if (replacement && (!previous || fields.some(k => String(current[k] ?? '') !== String(previous[k] ?? '')))) {
        throw Object.assign(new Error('This transaction changed since you opened it. Refresh before editing.'), { statusCode: 409 });
      }
      const balances = new Map();
      for (const [tx, sign] of [[current, 1], [replacement, -1]]) {
        const loan = tx?.type === 'transfer' && accounts.find(a => a.id === tx.to_account_id && a.type === 'loan');
        if (loan) balances.set(loan, (balances.get(loan) ?? Number(loan.balance)) + sign * Number(tx.amount));
      }
      if ([...balances.values()].some(b => !Number.isFinite(b))) throw new Error('The loan has an invalid stored balance');
      if (replacement) txs.push({ ...current, id: `${id}:revision:${randomUUID()}`, voided: true });
      Object.assign(current, replacement || { voided: true });
      if (replacement) for (const t of txs) if (shareNote.ids.includes(t.id)) t.note = shareNote.note || '';
      for (const [loan, balance] of balances) loan.balance = Math.round((balance + Number.EPSILON) * 100) / 100;
    },
    voidTransaction: async id => { await mock.updateTransaction(id, null); },
  };
  const sheetsPath = require.resolve('../netlify/functions/lib/sheets.js');
  require.cache[sheetsPath] = { id: sheetsPath, filename: sheetsPath, loaded: true, exports: mock };
} else if (!process.env.APP_PASSCODE) {
  console.warn('APP_PASSCODE is not set in .env — every request will be refused.');
}

const handlers = {};
function loadHandlers() {
  handlers['/.netlify/functions/api'] = require('../netlify/functions/api.js').handler;
  // Logo upload needs Cloudinary; without it, say so instead of failing obscurely.
  handlers['/.netlify/functions/upload-logo'] = process.env.CLOUDINARY_CLOUD_NAME
    ? require('../netlify/functions/upload-logo.js').handler
    : async () => ({ statusCode: 501, body: JSON.stringify({ success: false, error: 'Logo upload needs the Cloudinary settings in .env' }) });
}
loadHandlers();
// Backend edits apply without a restart: drop the function modules from the
// require cache and load them again (the offline in-memory store is kept).
const fnDir = require.resolve('../netlify/functions/api.js').replace(/api\.js$/, '');
const keep = offline ? require.resolve('../netlify/functions/lib/sheets.js') : null;
function reloadHandlers(file) {
  if (!file.startsWith(fnDir)) return;
  for (const key of Object.keys(require.cache)) if (key.startsWith(fnDir) && key !== keep) delete require.cache[key];
  try { loadHandlers(); console.log('Reloaded functions after', file.slice(fnDir.length)); }
  catch (err) { console.error('Function reload failed, keeping the previous version:', err.message); }
}

const server = await createServer({
  server: { port: 5173 },
  plugins: [{
    name: 'local-functions',
    configureServer(s) {
      s.watcher.add(fnDir);
      s.watcher.on('change', reloadHandlers);
      for (const path of Object.keys(handlers)) {
        s.middlewares.use(path, async (req, res) => {
          const handler = handlers[path];
          let body = ''; for await (const c of req) body += c;
          const url = new URL(req.url, 'http://x');
          const r = await handler({ httpMethod: req.method, body, headers: req.headers, queryStringParameters: Object.fromEntries(url.searchParams) });
          res.statusCode = r.statusCode; res.setHeader('Content-Type', 'application/json'); res.end(r.body);
        });
      }
    },
  }],
});
await server.listen();
console.log(offline ? 'Mode: offline (in-memory data, passcode "demo")' : `Mode: Google Sheet ${process.env.SHEET_ID.slice(0, 6)}…`);
server.printUrls();
