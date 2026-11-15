// Local server: Vite + the real Netlify function handlers, no Netlify CLI needed.
//   npm run local   (reads .env if present)
// With SHEET_ID set it talks to your real Google Sheet; without it, it uses an
// in-memory store (data resets on restart, passcode "demo").
import { createRequire } from 'module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);

const offline = !process.env.SHEET_ID;
if (offline) {
  process.env.APP_PASSCODE ??= 'demo';
  // SEED_FILE=path.json (from dev/import-moneymgr.mjs) preloads the in-memory store.
  const seed = process.env.SEED_FILE ? JSON.parse((await import('fs')).readFileSync(process.env.SEED_FILE, 'utf8')) : {};
  const accounts = seed.accounts ?? [], txs = seed.transactions ?? [];
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
} else if (!process.env.APP_PASSCODE) {
  console.warn('APP_PASSCODE is not set in .env — every request will be refused.');
}

const handlers = {
  '/.netlify/functions/api': require('../netlify/functions/api.js').handler,
  // Logo upload needs Cloudinary; without it, say so instead of failing obscurely.
  '/.netlify/functions/upload-logo': process.env.CLOUDINARY_CLOUD_NAME
    ? require('../netlify/functions/upload-logo.js').handler
    : async () => ({ statusCode: 501, body: JSON.stringify({ success: false, error: 'Logo upload needs the Cloudinary settings in .env' }) }),
};

const server = await createServer({
  server: { port: 5173 },
  plugins: [{
    name: 'local-functions',
    configureServer(s) {
      for (const [path, handler] of Object.entries(handlers)) {
        s.middlewares.use(path, async (req, res) => {
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
