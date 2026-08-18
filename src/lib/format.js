export function peso(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return sign + '₱' + abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CATEGORIES = ['Groceries', 'Dining', 'Transport', 'Bills', 'Fun', 'Health', 'Home', 'Other'];
