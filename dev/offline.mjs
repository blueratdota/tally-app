// Offline dev: Vite + real api.js handler, with sheets.js swapped for an in-memory store.
// Data resets on restart. Run: node dev/offline.mjs
import { createRequire } from 'module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
process.env.APP_PASSCODE ??= 'demo'; // offline only

const accounts = [], txs = [];
const mock = {
  listAccounts: async () => accounts.map(a => ({ ...a })),
  appendAccount: async a => { accounts.push({ ...a, archived: false }); },
  updateAccount: async (id, patch) => {
    const a = accounts.find(x => x.id === id);
    if (!a) throw new Error('Account not found');
    return Object.assign(a, patch);
  },
  listTransactions: async () => txs.map(t => ({ ...t })),
  appendTransaction: async t => { txs.push({ ...t, voided: false }); },
  voidTransaction: async id => {
    const t = txs.find(x => x.id === id);
    if (!t) throw new Error('Transaction not found');
    t.voided = true;
  },
};
const sheetsPath = require.resolve('../netlify/functions/lib/sheets.js');
require.cache[sheetsPath] = { id: sheetsPath, filename: sheetsPath, loaded: true, exports: mock };
const { handler } = require('../netlify/functions/api.js');

const server = await createServer({
  server: { port: 5173 },
  plugins: [{
    name: 'offline-api',
    configureServer(s) {
      s.middlewares.use('/.netlify/functions/api', async (req, res) => {
        let body = ''; for await (const c of req) body += c;
        const url = new URL(req.url, 'http://x');
        const r = await handler({ httpMethod: req.method, body, headers: req.headers, queryStringParameters: Object.fromEntries(url.searchParams) });
        res.statusCode = r.statusCode; res.setHeader('Content-Type', 'application/json'); res.end(r.body);
      });
      s.middlewares.use('/.netlify/functions/upload-logo', (_q, res) => {
        res.statusCode = 501; res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: 'Logo upload disabled offline' }));
      });
    },
  }],
});
await server.listen();
server.printUrls();
