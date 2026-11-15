import type { Owner, Person } from './api';

export function peso(n: unknown) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return sign + '₱' + abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Default display names; saved household settings override them. IDs remain p1/p2.
export const PEOPLE: Record<Person, string> = { p1: 'Person 1', p2: 'Person 2' };
export const ownerLabel = (o: Owner, names: Record<Person, string> = PEOPLE) => (o === 'shared' ? 'Shared' : names[o] || 'Shared');
// Household day in Manila, matching server balances and recurring schedules.
export const localDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export const CATEGORIES = [
  'Groceries', 'Dining', 'Transport', 'Bills', 'Fun', 'Health', 'Home', 'Other',
  // from the Money Manager import
  'Fuel', 'Travel', 'Gaming', 'Sports', 'Social Life', 'Beauty', 'Education', 'Subscription',
  'Fees', 'Gift', 'Shopee', 'Shopping', 'Apparel', 'Pautang', 'Balance adjustment'
];

export const FREQUENCIES = { daily: 'Daily', weekly: 'Weekly', fortnightly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' } as const;
