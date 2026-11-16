const crypto = require('crypto');
const sheetsDb = require('./lib/sheets');
const { installmentSchedule } = require('./lib/installments');
const { FREQUENCIES, occurrence, dueCharges, transactionKey, nextChargeDate } = require('./lib/plans');
const { computeSavingsBalance, computeCreditCard, computeNetWorth, monthlySpending, netWorthHistory, round2, householdToday } = require('./lib/balances');
const { passcodeOk, denied } = require('./lib/passcode');

const VALID_TYPES = ['savings', 'creditcard', 'loan'];
const VALID_TX_TYPES = ['income', 'expense', 'transfer'];
const PEOPLE = ['p1', 'p2'];
const OWNERS = [...PEOPLE, 'shared'];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (!passcodeOk(event)) return denied;
  const resource = event.queryStringParameters?.resource;
  try {
    if (resource === 'accounts') return await handleAccounts(event);
    if (resource === 'transactions') return await handleTransactions(event);
    if (resource === 'plans') return await handlePlans(event);
    if (resource === 'goals') return await handleGoals(event);
    if (resource === 'settings') return await handleSettings(event);
    return json(400, { success: false, error: 'Unknown resource. Use ?resource=accounts or ?resource=transactions' });
  } catch (err) {
    return json(err.statusCode || 500, { success: false, error: err.message });
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
    // Every view at once (combined, or strictly personal accounts), so the
    // client can switch person without another round trip to Sheets.
    const netWorthByView = { all: computeNetWorth(live, transactions) };
    const historyByView = { all: netWorthHistory(live, transactions) };
    for (const p of PEOPLE) {
      const mine = live.filter(a => a.owner === p);
      netWorthByView[p] = computeNetWorth(mine, transactions);
      historyByView[p] = netWorthHistory(mine, transactions);
    }
    const month = /^\d{4}-\d{2}$/.test(event.queryStringParameters?.month || '')
      ? event.queryStringParameters.month : todayISO().slice(0, 7);
    const spending = monthlySpending(transactions, month);
    return json(200, { success: true, accounts: enriched, netWorthByView, historyByView, spending, month });
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    if (body.action === 'adjust_balance') {
      const accounts = await sheetsDb.listAccounts();
      const account = accounts.find(a => a.id === body.id && a.type === 'savings' && !a.archived);
      if (!account) throw userError('Choose an active savings account');
      const target = Number(body.balance);
      if (!['number', 'string'].includes(typeof body.balance) || String(body.balance).trim() === '' || !Number.isFinite(target) || !Number.isSafeInteger(Math.round(target * 100)) || Math.abs(target * 100 - Math.round(target * 100)) > 0.000001) throw userError('Enter a valid current balance');
      const transactions = await sheetsDb.listTransactions();
      const current = computeSavingsBalance(account.id, transactions);
      if (Number(body.previous_balance) !== current) throw userError('This balance changed. Refresh before adjusting it.', 409);
      const delta = round2(target - current);
      if (!delta) return json(200, { success: true });
      const tx = validateTransaction({ type: delta > 0 ? 'income' : 'expense', date: todayISO(), amount: Math.abs(delta), description: `Balance adjustment: ${account.name}`, person: body.person, category: delta < 0 ? body.category || 'Balance adjustment' : 'Balance adjustment', from_account_id: delta < 0 ? account.id : '', to_account_id: delta > 0 ? account.id : '' }, accounts);
      await sheetsDb.appendTransaction(tx);
      return json(200, { success: true, transaction: tx });
    }
    if (body.action === 'update') {
      if (!body.id) return json(400, { success: false, error: 'Missing id' });
      const account = (await sheetsDb.listAccounts()).find(a => a.id === body.id);
      if (!account) throw userError('Account not found', 404);
      const patch = validateAccountFields(body.patch, account.type, true);
      const updated = await sheetsDb.updateAccount(body.id, patch);
      return json(200, { success: true, account: updated });
    }

    if (body.action === 'archive') {
      if (!body.id) return json(400, { success: false, error: 'Missing id' });
      await sheetsDb.updateAccount(body.id, { archived: true });
      return json(200, { success: true });
    }

    // default action: create
    if (!VALID_TYPES.includes(body.type)) return json(400, { success: false, error: 'Invalid account type' });
    const { type: accountType, action: accountAction, ...fields } = body;
    const validated = validateAccountFields(fields, accountType);
    const account = {
      id: crypto.randomUUID(),
      type: body.type,
      name: validated.name,
      balance: validated.balance ?? '',
      cutoff_day: validated.cutoff_day ?? '',
      due_day: validated.due_day ?? '',
      logo_url: validated.logo_url || '',
      archived: false,
      owner: validated.owner
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

    if (['import_preview', 'import'].includes(body.action)) return handleImport(body);
    if (body.action === 'void') {
      if (!body.id) return json(400, { success: false, error: 'Missing id' });
      await sheetsDb.voidTransaction(body.id);
      return json(200, { success: true });
    }

    const action = body.action || 'create';
    if (!['create', 'update'].includes(action)) return json(400, { success: false, error: 'Invalid transaction action' });
    let original;
    if (action === 'update') {
      if (typeof body.id !== 'string' || !body.id || body.previous?.id !== body.id) {
        return json(400, { success: false, error: 'An edit needs the original transaction' });
      }
      if (body.installments !== undefined) return json(400, { success: false, error: 'Edit one installment charge at a time' });
      original = (await sheetsDb.listTransactions()).find(t => t.id === body.id);
      if (!original) return json(404, { success: false, error: 'Transaction not found' });
      if (original.voided) return json(409, { success: false, error: 'This transaction has been voided. Refresh your data.' });
    }
    if (body.recurring && body.installments !== undefined) throw userError('Choose recurring or installment, not both');
    if (action === 'update' && body.recurring) throw userError('Manage recurring expenses under schedules');
    const accounts = await sheetsDb.listAccounts();
    const tx = validateTransaction(body, accounts, original);
    const { type, date } = tx;
    const numAmount = tx.amount;
    if (action === 'update') {
      tx.id = body.id;
      await sheetsDb.updateTransaction(body.id, tx, body.previous);
      return json(200, { success: true, transaction: tx });
    }
    if (body.installments !== undefined) {
      const count = body.installments;
      if (type !== 'expense' || !Number.isInteger(count) || count < 2 || count > 120) {
        return json(400, { success: false, error: 'Installments must be an expense with 2–120 monthly charges' });
      }
      const cents = Math.round(numAmount * 100);
      if (!Number.isSafeInteger(cents) || cents < count) {
        return json(400, { success: false, error: 'The total must cover at least ₱0.01 per installment' });
      }
      const card = accounts.find(a => a.id === body.from_account_id && !a.archived && a.type === 'creditcard');
      if (!card) return json(400, { success: false, error: 'Installments need an active credit card' });
      const plan = { id: crypto.randomUUID(), kind: 'installment', account_id: tx.from_account_id, person: tx.person, amount: round2(numAmount / count), description: tx.description, category: tx.category, start_date: date, frequency: 'monthly', end_date: '', count, active: true, legacy_ids: '' };
      const transactions = installmentSchedule(numAmount, date, count).map((charge, i) => ({
        ...tx, ...charge, id: `${plan.id}:${i + 1}`, description: `${tx.description} (${i + 1}/${count})`, plan_id: plan.id, plan_index: i + 1
      }));
      await sheetsDb.commit({ transactions, records: [{ table: 'Plans', record: plan }] });
      return json(200, { success: true, transactions });
    }
    if (body.recurring) {
      money(tx.amount);
      if (type !== 'expense' || !FREQUENCIES.includes(body.recurring.frequency)) throw userError('Choose a valid expense recurrence frequency');
      const end = body.recurring.end_date || '';
      if (end && (!validDate(end) || end < date)) throw userError('The end date must be on or after the first charge');
      const plan = { id: crypto.randomUUID(), kind: 'recurring', account_id: tx.from_account_id, person: tx.person, amount: tx.amount, description: tx.description, category: tx.category, start_date: date, frequency: body.recurring.frequency, end_date: end, count: '', active: true, legacy_ids: '' };
      const transactions = dueCharges(plan, todayISO(), new Set());
      await sheetsDb.commit({ transactions, records: [{ table: 'Plans', record: plan }] });
      return json(200, { success: true, plan, transactions });
    }
    await sheetsDb.commit({ transactions: [tx] });

    return json(200, { success: true, transaction: tx });
  }

  return json(405, { success: false, error: 'Method not allowed' });
}

function userError(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function todayISO() { return householdToday().toLocaleDateString('en-CA'); }
function validDate(value) {
  const at = typeof value === 'string' ? new Date(value + 'T00:00:00Z') : new Date(NaN);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === value;
}
function money(value, allowZero = false) {
  const n = Number(value), cents = Math.round(n * 100);
  if (!['number', 'string'].includes(typeof value) || !Number.isFinite(n) || !Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1) || Math.abs(n * 100 - cents) > 0.000001) throw userError('Enter a valid amount with up to two decimal places');
  return cents / 100;
}
function validateAccountFields(fields, type, partial = false) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw userError('Enter account fields');
  const allowed = ['name', 'owner', ...(type === 'loan' ? ['balance'] : type === 'creditcard' ? ['cutoff_day', 'due_day', 'logo_url'] : [])];
  if (Object.keys(fields).some(k => !allowed.includes(k))) throw userError('Account contains fields that cannot be edited');
  const result = {};
  for (const key of allowed) {
    const value = fields[key];
    if (value === undefined && (partial || key === 'logo_url')) continue;
    if (key === 'name') {
      if (typeof value !== 'string' || !value.trim()) throw userError('Name is required');
      result[key] = value.trim();
    } else if (key === 'owner') {
      if (!OWNERS.includes(value)) throw userError('Owner must be p1, p2 or shared');
      result[key] = value;
    } else if (key === 'logo_url') {
      if (typeof value !== 'string') throw userError('Logo URL must be text');
      result[key] = value;
    } else {
      const n = Number(value), cents = Math.round(n * 100);
      if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(n)) throw userError('Enter a valid account number');
      if (key === 'balance' ? !Number.isSafeInteger(cents) || Math.abs(n * 100 - cents) > 0.000001 : !Number.isInteger(n) || n < 1 || n > 31) throw userError(key === 'balance' ? 'Enter a balance with up to two decimal places' : 'Cutoff and due day must be between 1 and 31');
      result[key] = key === 'balance' ? cents / 100 : n;
    }
  }
  return result;
}
function validateTransaction(body, accounts, original) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw userError('Each row must contain a transaction');
    const { type, date, amount, description } = body;
    if (original?.plan_id && type !== 'expense') throw userError('Scheduled charges must remain expenses');
    if (!VALID_TX_TYPES.includes(type)) throw userError('Invalid transaction type');
    const at = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : new Date(NaN);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
      throw userError('Enter a valid transaction date');
    }
    const numAmount = Number(amount);
    const amountCents = Math.round(numAmount * 100);
    if (!['number', 'string'].includes(typeof amount) || !Number.isFinite(numAmount) || !Number.isSafeInteger(amountCents) || (type === 'expense' ? Math.abs(amountCents) < 1 : amountCents < 1) || Math.abs(numAmount * 100 - amountCents) > 0.000001) {
      throw userError('Enter a valid positive amount with up to two decimal places');
    }
    if (original?.plan_id && amountCents < 1) throw userError('Scheduled charges must have a positive amount');
    if (typeof description !== 'string' || !description.trim()) throw userError('Description is required');
    if (!PEOPLE.includes(body.person)) throw userError('Say who this transaction is for (p1 or p2)');
    if (body.category !== undefined && typeof body.category !== 'string') throw userError('Category must be text');
    const validAccount = (field, types) => accounts.some(a => a.id === body[field] && types.includes(a.type) && (!a.archived || original?.[field] === a.id));
    if (type === 'income' && !validAccount('to_account_id', ['savings'])) throw userError('Income needs a savings account');
    if (type === 'expense' && !validAccount('from_account_id', ['savings', 'creditcard'])) throw userError('Expense needs a savings account or credit card');
    if (type === 'transfer' && (!validAccount('from_account_id', ['savings']) || !validAccount('to_account_id', VALID_TYPES) || body.from_account_id === body.to_account_id)) {
      throw userError('Transfer needs different valid source and destination accounts');
    }
    if (type === 'transfer' && date > todayISO() && accounts.some(a => a.id === body.to_account_id && a.type === 'loan')) throw userError('Loan payments cannot be dated in the future');

    return {
      id: crypto.randomUUID(),
      date,
      type,
      amount: amountCents / 100,
      description: description.trim(),
      category: type === 'expense' ? body.category || '' : '',
      from_account_id: type === 'income' ? '' : body.from_account_id,
      to_account_id: type === 'expense' ? '' : body.to_account_id,
      voided: false,
      person: body.person,
      plan_id: original?.plan_id || '',
      plan_index: original?.plan_index || ''
    };
}

async function syncPlans() {
  const [plans, txs, accounts] = await Promise.all([sheetsDb.listRecords('Plans'), sheetsDb.listTransactions(), sheetsDb.listAccounts()]);
  const existing = new Set(txs.map(t => t.id));
  const transactions = plans.filter(p => accounts.some(a => a.id === p.account_id && !a.archived)).flatMap(p => dueCharges(p, todayISO(), existing));
  // shortcut: recurring charges catch up when the app refreshes; add a scheduled function if background posting is needed.
  if (transactions.length) await sheetsDb.commit({ transactions });
  return plans.map(p => ({ ...p, next_date: nextChargeDate(p, todayISO()) }));
}

async function handlePlans(event) {
  if (event.httpMethod === 'GET') return json(200, { success: true, plans: await syncPlans() });
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });
  const body = JSON.parse(event.body || '{}');
  const [plans, transactions, accounts] = await Promise.all([syncPlans(), sheetsDb.listTransactions(), sheetsDb.listAccounts()]);
  if (body.action === 'link_installments') {
    if (!Array.isArray(body.transaction_ids) || !body.transaction_ids.length || body.transaction_ids.length > 500) throw userError('Choose the existing installment entries');
    const rows = transactions.filter(t => body.transaction_ids.includes(t.id) && !t.voided);
    if (rows.length !== new Set(body.transaction_ids).size || rows.some(t => t.type !== 'expense' || Number(t.amount) <= 0 || t.from_account_id !== rows[0].from_account_id || t.person !== rows[0].person || t.plan_id || plans.some(p => String(p.legacy_ids || '').split(',').includes(t.id)))) throw userError('Choose unlinked expenses from one card and one person');
    if (!accounts.some(a => a.id === rows[0].from_account_id && a.type === 'creditcard' && !a.archived)) throw userError('Choose charges on an active credit card');
    if (typeof body.description !== 'string' || !body.description.trim()) throw userError('Name this installment plan');
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const plan = { id: crypto.randomUUID(), kind: 'installment', account_id: rows[0].from_account_id, person: rows[0].person, amount: Number(rows[0].amount), description: body.description.trim(), category: rows[0].category || 'Other', start_date: rows[0].date, frequency: 'monthly', end_date: '', count: rows.length, active: true, legacy_ids: rows.map(t => t.id).join(',') };
    await sheetsDb.commit({ records: [{ table: 'Plans', record: plan }] });
    return json(200, { success: true, plan });
  }
  const plan = plans.find(p => p.id === body.id);
  if (!plan) throw userError('Plan not found', 404);
  const today = todayISO();
  const linked = t => t.plan_id === plan.id || String(plan.legacy_ids || '').split(',').includes(t.id);
  const future = transactions.filter(t => !t.voided && linked(t) && t.date > today);
  if (body.action === 'stop') {
    await sheetsDb.commit({ voidIds: future.map(t => t.id), records: [{ table: 'Plans', record: { ...plan, active: false } }] });
    return json(200, { success: true });
  }
  if (body.action !== 'update') throw userError('Invalid plan action');
  if (!plan.active) throw userError('This plan has stopped');
  const amount = money(body.amount);
  if (!validDate(body.next_date) || body.next_date <= today) throw userError('Choose a future next charge date');
  if (plan.kind === 'recurring') {
    if (!FREQUENCIES.includes(body.frequency)) throw userError('Choose a frequency');
    const end = body.end_date || '';
    if (end && (!validDate(end) || end < body.next_date)) throw userError('Check the end date');
    const updated = { ...plan, amount, start_date: body.next_date, frequency: body.frequency, end_date: end };
    await sheetsDb.commit({ records: [{ table: 'Plans', record: updated, previous: body.previous }] });
    return json(200, { success: true, plan: updated });
  }
  const count = Number(body.remaining_count);
  if (!Number.isInteger(count) || count < 1 || count > 120) throw userError('Choose 1–120 remaining charges');
  money(amount * count);
  const posted = transactions.filter(t => !t.voided && linked(t) && t.date <= today).length;
  const revision = crypto.randomUUID();
  const charges = Array.from({ length: count }, (_, i) => ({ id: `${plan.id}:${revision}:${i + 1}`, date: occurrence(body.next_date, 'monthly', i), type: 'expense', amount, description: `${plan.description} (${posted + i + 1}/${posted + count})`, category: plan.category, from_account_id: plan.account_id, to_account_id: '', person: plan.person, voided: false, plan_id: plan.id, plan_index: posted + i + 1 }));
  await sheetsDb.commit({ transactions: charges, voidIds: future.map(t => t.id), records: [{ table: 'Plans', record: { ...plan, amount, count: posted + count }, previous: body.previous }] });
  return json(200, { success: true });
}

async function handleGoals(event) {
  const goals = await sheetsDb.listRecords('Goals');
  if (event.httpMethod === 'GET') return json(200, { success: true, goals: goals.filter(g => !g.archived) });
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });
  const body = JSON.parse(event.body || '{}');
  const old = body.id && goals.find(g => g.id === body.id && !g.archived);
  if (body.id && !old) throw userError('Goal not found', 404);
  if (body.action === 'archive' && old) {
    await sheetsDb.commit({ records: [{ table: 'Goals', record: { ...old, archived: true } }] });
    return json(200, { success: true });
  }
  if (typeof body.name !== 'string' || !body.name.trim()) throw userError('Name your savings goal');
  const [accounts, transactions] = await Promise.all([sheetsDb.listAccounts(), sheetsDb.listTransactions()]);
  const account = accounts.find(a => a.id === body.account_id && a.type === 'savings' && !a.archived);
  if (!account) throw userError('Choose an active savings account');
  const target = money(body.target), saved = money(body.saved, true);
  if (saved > target) throw userError('Reserved money cannot exceed the goal target');
  const reserved = goals.filter(g => !g.archived && g.account_id === account.id && g.id !== body.id).reduce((n, g) => n + Number(g.saved), 0);
  if (round2(reserved + saved) > Math.max(0, computeSavingsBalance(account.id, transactions))) throw userError('The account does not have enough money for these reservations');
  const goal = { id: old?.id || crypto.randomUUID(), account_id: account.id, name: body.name.trim(), target, saved, archived: false };
  await sheetsDb.commit({ records: [{ table: 'Goals', record: goal }] });
  return json(200, { success: true, goal });
}

async function handleSettings(event) {
  const records = await sheetsDb.listRecords('Settings');
  if (event.httpMethod === 'GET') return json(200, { success: true, names: Object.fromEntries(PEOPLE.map((p, i) => [p, records.find(r => r.id === p)?.value || `Person ${i + 1}`])) });
  if (event.httpMethod !== 'POST') return json(405, { success: false, error: 'Method not allowed' });
  const body = JSON.parse(event.body || '{}');
  const names = Object.fromEntries(PEOPLE.map(p => [p, typeof body.names?.[p] === 'string' ? body.names[p].trim() : '']));
  if (PEOPLE.some(p => !names[p] || names[p].length > 40)) throw userError('Enter both names, up to 40 characters each');
  if (names.p1.toLowerCase() === names.p2.toLowerCase()) throw userError('Use different names so you can tell the people apart');
  await sheetsDb.commit({ records: PEOPLE.map(id => ({ table: 'Settings', record: { id, value: names[id] } })) });
  return json(200, { success: true, names });
}

async function handleImport(body) {
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 1000) throw userError('Import 1–1,000 transactions at a time');
  const [accounts, existing] = await Promise.all([sheetsDb.listAccounts(), sheetsDb.listTransactions()]);
  const keys = new Set(existing.filter(t => !t.voided).map(transactionKey));
  const ids = new Set(existing.map(t => t.id));
  const preview = body.rows.map((row, index) => {
    try {
      const matched = existing.find(t => t.id === row?.id);
      if (matched && row.include_duplicate !== true) return { index, transaction: matched, duplicate: true, error: '' };
      const tx = validateTransaction(row, accounts);
      const key = transactionKey(tx);
      const duplicate = (row.id && ids.has(row.id)) || keys.has(key);
      keys.add(key);
      return { index, transaction: tx, duplicate: !!duplicate, error: '' };
    } catch (err) { return { index, error: err.message, duplicate: false }; }
  });
  if (body.action === 'import_preview') return json(200, { success: true, preview });
  const invalid = preview.find(p => p.error);
  if (invalid) throw userError(`Row ${invalid.index + 1}: ${invalid.error}`);
  const transactions = preview.filter(p => !p.duplicate || body.rows[p.index].include_duplicate === true).map(p => p.transaction);
  if (transactions.length) await sheetsDb.commit({ transactions });
  return json(200, { success: true, imported: transactions.length, skipped: preview.length - transactions.length });
}
