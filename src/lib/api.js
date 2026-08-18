async function get(resource) {
  const res = await fetch(`/.netlify/functions/api?resource=${resource}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

async function post(resource, body) {
  const res = await fetch(`/.netlify/functions/api?resource=${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  getAccounts: () => get('accounts'),
  getTransactions: () => get('transactions'),
  createTransaction: (payload) => post('transactions', payload),
  voidTransaction: (id) => post('transactions', { action: 'void', id }),
  createAccount: (payload) => post('accounts', payload),
  updateAccount: (id, patch) => post('accounts', { action: 'update', id, patch }),
  archiveAccount: (id) => post('accounts', { action: 'archive', id }),
  async uploadLogo(dataUri) {
    const res = await fetch('/.netlify/functions/upload-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUri })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.url;
  }
};
