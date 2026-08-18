const crypto = require('crypto');
const sheetsDb = require('./lib/sheets');
const { computeSavingsBalance, computeCreditCard, computeNetWorth } = require('./lib/balances');

const VALID_TYPES = ['savings', 'creditcard', 'loan'];
const VALID_TX_TYPES = ['income', 'expense', 'transfer'];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const resource = event.queryStringParameters?.resource;
  try {
    if (resource === 'accounts') return await handleAccounts(event);
    if (resource === 'transactions') return await handleTransactions(event);
    return json(400, { success: false, error: 'Unknown resource. Use ?resource=accounts or ?resource=transactions' });
  } catch (err) {
    return json(500, { success: false, error: err.message });
  }
};

async function handleAccounts(event) {
  if (event.httpMethod === 'GET') {
    const [accounts, transactions] = await Promise.all([sheetsDb.listAccounts(), sheetsDb.listTransactions()]);
    const live = accounts.filter(a => !a.archived);
    const enriched = live.map(a => {
      if (a.type === 'savings') return { ...a, balance: computeSavingsBalance(a.id, transactions) };
      if (a.type === 'creditcard') return { ...a, ...computeCreditCard(a, transactions) };
      return a; // loan: balance field is already the stored, manually-maintained value
    });
    const netWorth = computeNetWorth(live, transactions);
    return json(200, { success: true, accounts: enriched, netWorth });
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    if (body.action === 'update') {
      if (!body.id) return json(400, { success: false, error: 'Missing id' });
      const updated = await sheetsDb.updateAccount(body.id, body.patch || {});
      return json(200, { success: true, account: updated });
    }

    if (body.action === 'archive') {
      if (!body.id) return json(400, { success: false, error: 'Missing id' });
      await sheetsDb.updateAccount(body.id, { archived: true });
      return json(200, { success: true });
    }

    // default action: create
    if (!VALID_TYPES.includes(body.type)) return json(400, { success: false, error: 'Invalid account type' });
    if (!body.name || !body.name.trim()) return json(400, { success: false, error: 'Name is required' });
    if (body.type === 'creditcard') {
      const c = Number(body.cutoff_day), d = Number(body.due_day);
      if (!(c >= 1 && c <= 31) || !(d >= 1 && d <= 31)) {
        return json(400, { success: false, error: 'Cutoff and due day must be between 1 and 31' });
      }
    }
    if (body.type === 'loan' && isNaN(Number(body.balance))) {
      return json(400, { success: false, error: 'Loan balance must be a number' });
    }

    const account = {
      id: crypto.randomUUID(),
      type: body.type,
      name: body.name.trim(),
      balance: body.type === 'loan' ? Number(body.balance) : '',
      cutoff_day: body.type === 'creditcard' ? Number(body.cutoff_day) : '',
      due_day: body.type === 'creditcard' ? Number(body.due_day) : '',
      logo_url: body.logo_url || '',
      archived: false
    };
    await sheetsDb.appendAccount(account);
    return json(200, { success: true, account });
  }

  return json(405, { success: false, error: 'Method not allowed' });
}

async function handleTransactions(event) {
  if (event.httpMethod === 'GET') {
    const transactions = await sheetsDb.listTransactions();
    return json(200, { success: true, transactions: transactions.filter(t => !t.voided) });
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    if (body.action === 'void') {
      if (!body.id) return json(400, { success: false, error: 'Missing id' });
      await sheetsDb.voidTransaction(body.id);
      return json(200, { success: true });
    }

    // default action: create
    const { type, date, amount, description } = body;
    if (!VALID_TX_TYPES.includes(type)) return json(400, { success: false, error: 'Invalid transaction type' });
    if (!date) return json(400, { success: false, error: 'Date is required' });
    const numAmount = Number(amount);
    if (!(numAmount > 0)) return json(400, { success: false, error: 'Amount must be a positive number' });
    if (!description || !description.trim()) return json(400, { success: false, error: 'Description is required' });

    if (type === 'income' && !body.to_account_id) return json(400, { success: false, error: 'Income needs a destination account' });
    if (type === 'expense' && !body.from_account_id) return json(400, { success: false, error: 'Expense needs a source account' });
    if (type === 'transfer' && (!body.from_account_id || !body.to_account_id)) {
      return json(400, { success: false, error: 'Transfer needs both a source and destination account' });
    }

    const tx = {
      id: crypto.randomUUID(),
      date,
      type,
      amount: numAmount,
      description: description.trim(),
      category: body.category || '',
      from_account_id: body.from_account_id || '',
      to_account_id: body.to_account_id || '',
      voided: false
    };
    await sheetsDb.appendTransaction(tx);

    // A transfer INTO a loan is a payment — auto-reduce that loan's stored balance.
    if (type === 'transfer') {
      const accounts = await sheetsDb.listAccounts();
      const destination = accounts.find(a => a.id === body.to_account_id);
      if (destination && destination.type === 'loan') {
        const newBalance = Number(destination.balance) - numAmount;
        await sheetsDb.updateAccount(destination.id, { balance: newBalance });
      }
    }

    return json(200, { success: true, transaction: tx });
  }

  return json(405, { success: false, error: 'Method not allowed' });
}
