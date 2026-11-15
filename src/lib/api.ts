// Shapes returned by netlify/functions/api.js (sheet rows + derived balances).
export type Person = 'p1' | 'p2';
export type Owner = Person | 'shared';
export type View = 'all' | Person;
export type AccountType = 'savings' | 'creditcard' | 'loan';
export type TxType = 'income' | 'expense' | 'transfer';

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  owner: Owner;
  balance?: number | string; // savings: derived; loan: stored
  cutoff_day?: number | string;
  due_day?: number | string;
  logo_url?: string;
  // credit cards only (derived)
  current?: number;
  outstanding?: number;
  future?: number;
  dueNextMonth?: number;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  amount: number | string;
  description: string;
  category?: string;
  from_account_id?: string;
  to_account_id?: string;
  person?: Person;
}

export interface NetWorth { savings: number; cardDebt: number; futureDebt: number; loanDebt: number; netWorth: number }
export interface NetWorthPoint { month: string; netWorth: number }
export interface PersonSpending { total: number; categories: Record<string, number> }
export interface Spending { total: number; p1: PersonSpending; p2: PersonSpending }

const KEY = 'tally-passcode';
const store = {
  get: () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
  set: (v: string) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } }
};
let passcode = store.get();

export function setPasscode(v: string) { passcode = v; store.set(v); }
export const hasPasscode = () => !!passcode;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-tally-passcode': passcode },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }));
  if (!data.success) throw new ApiError(data.error || 'Request failed', res.status);
  return data as T;
}

const fn = (resource: string) => `/.netlify/functions/api?resource=${resource}`;

export type AccountFields = Partial<Pick<Account, 'name' | 'owner' | 'balance' | 'cutoff_day' | 'due_day' | 'logo_url'>>;
export type NewTransaction = Omit<Transaction, 'id'>;

export const api = {
  getAccounts: (month: string) =>
    call<{ accounts: Account[]; netWorthByView: Record<View, NetWorth>; historyByView: Record<View, NetWorthPoint[]>; spending: Spending }>(fn('accounts') + `&month=${month}`),
  getTransactions: () => call<{ transactions: Transaction[] }>(fn('transactions')),
  createTransaction: (payload: NewTransaction) => call(fn('transactions'), payload),
  voidTransaction: (id: string) => call(fn('transactions'), { action: 'void', id }),
  createAccount: (payload: AccountFields & { type: AccountType }) => call(fn('accounts'), payload),
  updateAccount: (id: string, patch: AccountFields) => call(fn('accounts'), { action: 'update', id, patch }),
  archiveAccount: (id: string) => call(fn('accounts'), { action: 'archive', id }),
  uploadLogo: async (dataUri: string) => (await call<{ url: string }>('/.netlify/functions/upload-logo', { image: dataUri })).url
};
