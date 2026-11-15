export function peso(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return sign + '₱' + abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The two people in the household. Stored in the sheet as p1/p2, so renaming here is safe.
export const PEOPLE = { p1: 'Person 1', p2: 'Person 2' };
export const ownerLabel = o => PEOPLE[o] || 'Shared';

// Today as YYYY-MM-DD in the device's own timezone (toISOString would give UTC).
export const localDate = () => new Date().toLocaleDateString('en-CA');

export const CATEGORIES = ['Groceries', 'Dining', 'Transport', 'Bills', 'Fun', 'Health', 'Home', 'Other'];
