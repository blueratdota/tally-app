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
// Balance adjustments (e.g. an existing account's opening balance) move balances but aren't real income or spending.
export const isAdjustment = (t: { category?: string }) => t.category === 'Balance adjustment';
export const localDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export interface CategoryStyle { emoji: string; color: string }
// Default emoji/color per category; saved household settings override them. Add a line here to add a category.
const EXPENSE_STYLES: Record<string, CategoryStyle> = {
  Groceries: { emoji: '🛒', color: '#16a34a' }, Dining: { emoji: '🍽️', color: '#f97316' }, Transport: { emoji: '🚌', color: '#0ea5e9' },
  Bills: { emoji: '🧾', color: '#64748b' }, Fun: { emoji: '🎉', color: '#d946ef' }, Health: { emoji: '💊', color: '#ef4444' },
  Home: { emoji: '🏠', color: '#a16207' }, Other: { emoji: '🏷️', color: '#94a3b8' },
  // from the Money Manager import
  Fuel: { emoji: '⛽', color: '#dc2626' }, Travel: { emoji: '✈️', color: '#06b6d4' }, Gaming: { emoji: '🎮', color: '#8b5cf6' },
  Sports: { emoji: '🏀', color: '#ea580c' }, 'Social Life': { emoji: '🥂', color: '#ec4899' }, Beauty: { emoji: '💄', color: '#f43f5e' },
  Education: { emoji: '📚', color: '#2563eb' }, Subscription: { emoji: '🔁', color: '#6366f1' }, Fees: { emoji: '💸', color: '#78716c' },
  Gift: { emoji: '🎁', color: '#e11d48' }, Shopee: { emoji: '🛍️', color: '#ee4d2d' }, Shopping: { emoji: '👜', color: '#db2777' },
  Apparel: { emoji: '👕', color: '#0891b2' }, Pautang: { emoji: '🤝', color: '#ca8a04' }, 'Balance adjustment': { emoji: '⚖️', color: '#71717a' },
};
const INCOME_STYLES: Record<string, CategoryStyle> = {
  Salary: { emoji: '💼', color: '#15803d' }, Bonus: { emoji: '🎊', color: '#9333ea' }, Freelance: { emoji: '💻', color: '#0284c7' },
  Business: { emoji: '🏪', color: '#b45309' }, Interest: { emoji: '🏦', color: '#0f766e' }, Refund: { emoji: '↩️', color: '#4f46e5' },
  Allowance: { emoji: '👛', color: '#be185d' }, 'Other income': { emoji: '💰', color: '#65a30d' },
};
export const CATEGORY_STYLES: Record<string, CategoryStyle> = { ...EXPENSE_STYLES, ...INCOME_STYLES };
// Sorted A–Z for every category picker.
const sorted = (o: object) => Object.keys(o).sort((a, b) => a.localeCompare(b));
export const CATEGORIES = sorted(EXPENSE_STYLES);
export const INCOME_CATEGORIES = sorted(INCOME_STYLES);
// Only what differs from the defaults is saved, so later default changes still apply.
export const styleOverrides = (styles: Record<string, CategoryStyle>) =>
  Object.fromEntries(Object.entries(styles).filter(([c, s]) => s.emoji !== CATEGORY_STYLES[c]?.emoji || s.color !== CATEGORY_STYLES[c]?.color));

export const FREQUENCIES = { daily: 'Daily', weekly: 'Weekly', fortnightly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' } as const;
