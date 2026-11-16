const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual refresh callback with controlled response order.
const app = fs.readFileSync('src/App.tsx', 'utf8');
const start = app.indexOf('  const loadAll =');
const code = ts.transpileModule(app.slice(start, app.indexOf('\n  useEffect', start)) + '\nrun = loadAll;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function context(getAccounts) {
  const state = {};
  const ctx = { refreshId: { current: 0 }, useCallback: f => f, localDate: () => '2026-11-16', ApiError, CATEGORY_STYLES: {},
    hasPasscode: () => true, setPasscode: value => { state.passcode = value; }, toast: { error: () => {} },
    api: { getPlans: async () => ({ plans: [] }), getAccounts, getTransactions: async () => ({ transactions: [] }), getGoals: async () => ({ goals: [] }), getSettings: async () => ({ names: {} }) } };
  for (const key of ['Plans', 'Goals', 'Names', 'CategoryStyles', 'Accounts', 'NetWorthByView', 'HistoryByView', 'Spending', 'Locked', 'Transactions', 'UnlockError']) ctx['set' + key] = value => { state[key] = value; };
  vm.runInNewContext(code, ctx);
  return { run: ctx.run, state };
}
(async () => {
  for (const staleError of [false, true]) {
    let release, count = 0;
    const { run, state } = context(async () => {
      if (++count === 1) {
        await new Promise(resolve => { release = resolve; });
        if (staleError) throw new ApiError('Old request denied', 401);
        return { accounts: ['old'] };
      }
      return { accounts: ['new'] };
    });
    const first = run();
    await new Promise(resolve => setImmediate(resolve));
    await run(); release(); await first;
    assert.equal(state.Accounts[0], 'new', 'old responses must not replace saved data');
    assert.equal(state.Locked, false, 'old auth errors must not lock a successful refresh');
    assert.equal(state.passcode, undefined);
  }
  const { run, state } = context(async () => { throw new Error('Sheets unavailable'); });
  await run();
  assert.match(state.UnlockError, /Sheets unavailable/, 'connection failures must appear in the unlock form');
  console.log('All refresh ordering and unlock-error checks passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
