const KEY = 'tally-passcode';
const store = {
  get: () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
  set: v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} }
};
let passcode = store.get();

export function setPasscode(v) { passcode = v; store.set(v); }
export const hasPasscode = () => !!passcode;

async function call(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-tally-passcode': passcode },
    body: body && JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }));
  if (!data.success) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

const fn = resource => `/.netlify/functions/api?resource=${resource}`;

export const api = {
  getAccounts: (month) => call(fn('accounts') + `&month=${month}`),
  getTransactions: () => call(fn('transactions')),
  createTransaction: (payload) => call(fn('transactions'), payload),
  voidTransaction: (id) => call(fn('transactions'), { action: 'void', id }),
  createAccount: (payload) => call(fn('accounts'), payload),
  updateAccount: (id, patch) => call(fn('accounts'), { action: 'update', id, patch }),
  archiveAccount: (id) => call(fn('accounts'), { action: 'archive', id }),
  uploadLogo: async (dataUri) => (await call('/.netlify/functions/upload-logo', { image: dataUri })).url
};
