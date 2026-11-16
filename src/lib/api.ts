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
  monthly_payment?: number | string; // loans only (stored)
  dueThisMonth?: number | null; // loans only (derived): monthly payment less what was paid this month
  paymentsLeft?: number | null; // loans only (derived)
  lastDueDate?: string | null;  // loans only (derived)
  // credit cards (derived); loans reuse dueDate/daysUntilDue
  current?: number;
  outstanding?: number;
  future?: number;
  dueNextMonth?: number;
  dueDate?: string | null;
  daysUntilDue?: number | null;
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
  plan_id?: string;
  plan_index?: number | string;
  note?: string;
}

export interface NetWorth { savings: number; cardDebt: number; futureDebt: number; loanDebt: number; netWorth: number }
export interface NetWorthPoint { month: string; netWorth: number }
export interface HouseholdSettings { names: Record<Person, string>; categories: Record<string, { emoji: string; color: string }> }
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

export type AccountFields = Partial<Pick<Account, 'name' | 'owner' | 'balance' | 'cutoff_day' | 'due_day' | 'logo_url' | 'monthly_payment'>>;
export type Frequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
export interface Plan { id: string; kind: 'installment' | 'recurring'; account_id: string; person: Person; amount: number; description: string; category: string; start_date: string; frequency: Frequency; end_date: string; count: number | ''; active: boolean; legacy_ids?: string; next_date?: string }
export interface Goal { id: string; account_id: string; name: string; target: number; saved: number; archived?: boolean }
export type NewTransaction = Omit<Transaction, 'id'> & { installments?: number; recurring?: { frequency: Frequency; end_date?: string } };
export type ImportRow = NewTransaction & { id?: string; include_duplicate?: boolean };
export interface ImportPreview { index: number; transaction?: Transaction; duplicate: boolean; error: string }


export const api = {
  getPlans: () => call<{ plans: Plan[] }>(fn('plans')),
  updatePlan: (plan: Plan, patch: { amount: number; next_date: string; remaining_count?: number; frequency?: Frequency; end_date?: string }) => call(fn('plans'), { ...patch, action: 'update', id: plan.id, previous: plan }),
  stopPlan: (id: string) => call(fn('plans'), { action: 'stop', id }),
  linkInstallments: (transaction_ids: string[], description: string) => call(fn('plans'), { action: 'link_installments', transaction_ids, description }),
  getGoals: () => call<{ goals: Goal[] }>(fn('goals')),
  saveGoal: (goal: Omit<Goal, 'id'> & { id?: string }) => call(fn('goals'), goal),
  archiveGoal: (id: string) => call(fn('goals'), { action: 'archive', id }),
  getSettings: () => call<HouseholdSettings>(fn('settings')),
  saveSettings: (settings: HouseholdSettings) => call<HouseholdSettings>(fn('settings'), settings),
  adjustBalance: (account: Account, balance: number, person: Person, category: string) => call(fn('accounts'), { action: 'adjust_balance', id: account.id, previous_balance: Number(account.balance), balance, person, category }),
  previewImport: (rows: ImportRow[]) => call<{ preview: ImportPreview[] }>(fn('transactions'), { action: 'import_preview', rows }),
  importTransactions: (rows: ImportRow[]) => call<{ imported: number; skipped: number }>(fn('transactions'), { action: 'import', rows }),
  getAccounts: (month: string) =>
    call<{ accounts: Account[]; netWorthByView: Record<View, NetWorth>; historyByView: Record<View, NetWorthPoint[]>; spending: Spending }>(fn('accounts') + `&month=${month}`),
  getTransactions: () => call<{ transactions: Transaction[] }>(fn('transactions')),
  createTransaction: (payload: NewTransaction) => call(fn('transactions'), payload),
  updateTransaction: (previous: Transaction, payload: NewTransaction) => call(fn('transactions'), { ...payload, action: 'update', id: previous.id, previous }),
  voidTransaction: (id: string) => call(fn('transactions'), { action: 'void', id }),
  createAccount: (payload: AccountFields & { type: AccountType }) => call(fn('accounts'), payload),
  updateAccount: (id: string, patch: AccountFields) => call(fn('accounts'), { action: 'update', id, patch }),
  archiveAccount: (id: string) => call(fn('accounts'), { action: 'archive', id }),
  uploadLogo: async (dataUri: string) => (await call<{ url: string }>('/.netlify/functions/upload-logo', { image: dataUri })).url
};
