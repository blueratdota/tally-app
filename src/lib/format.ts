import type { Owner, Person, View } from './api';

export function peso(n: unknown) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return sign + '₱' + abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The two people in the household. Stored in the sheet as p1/p2, so renaming here is safe.
export const PEOPLE: Record<Person, string> = { p1: 'Person 1', p2: 'Person 2' };
export const ownerLabel = (o: Owner) => (o === 'shared' ? 'Shared' : PEOPLE[o] || 'Shared');
// Header view switch: everyone together, or one person.
export const VIEWS: [View, string][] = [['all', 'Both of you'], ...(Object.entries(PEOPLE) as [Person, string][])];

// Today as YYYY-MM-DD in the device's own timezone (toISOString would give UTC).
export const localDate = () => new Date().toLocaleDateString('en-CA');

export const CATEGORIES = [
  'Groceries', 'Dining', 'Transport', 'Bills', 'Fun', 'Health', 'Home', 'Other',
  // from the Money Manager import
  'Fuel', 'Travel', 'Gaming', 'Sports', 'Social Life', 'Beauty', 'Education', 'Subscription',
  'Fees', 'Gift', 'Shopee', 'Shopping', 'Apparel', 'Pautang', 'Balance adjustment'
];
