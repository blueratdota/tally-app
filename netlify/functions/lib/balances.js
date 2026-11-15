// Pure functions: given accounts + transactions, derive every balance shown
// in the app. No network/sheet calls here, so this file can be unit-tested
// in isolation (see test/balances.test.js).

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// The most recent date matching `cutoffDay` that is on or before `today`.
// Clamps to the actual last day of a short month (e.g. cutoffDay=31 in Feb).
function lastCutoffDate(cutoffDay, today = new Date()) {
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const thisMonthCutoff = Math.min(cutoffDay, daysInMonth(y, m));
  if (d >= thisMonthCutoff) {
    return new Date(y, m, thisMonthCutoff);
  }
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  const prevCutoff = Math.min(cutoffDay, daysInMonth(py, pm));
  return new Date(py, pm, prevCutoff);
}

// Savings balance = every transaction that lands on or leaves this account.
function computeSavingsBalance(accountId, transactions) {
  let bal = 0;
  for (const t of transactions) {
    if (t.voided) continue;
    if (t.to_account_id === accountId) bal += Number(t.amount);
    if (t.from_account_id === accountId) bal -= Number(t.amount);
  }
  return round2(bal);
}

// Credit card debt split into:
//  - current   = billed before the last cutoff, due on the upcoming due date
//  - outstanding = spent after the last cutoff, not billed yet
// Payments (transfers TO the card) pay down `current` first, then `outstanding`.
function computeCreditCard(account, transactions, today = new Date()) {
  const cutoff = lastCutoffDate(account.cutoff_day, today);
  let billed = 0, unbilled = 0, paid = 0;

  for (const t of transactions) {
    if (t.voided) continue;
    if (t.type === 'expense' && t.from_account_id === account.id) {
      const d = new Date(t.date + 'T00:00:00');
      if (d <= cutoff) billed += Number(t.amount);
      else unbilled += Number(t.amount);
    }
    if (t.type === 'transfer' && t.to_account_id === account.id) {
      paid += Number(t.amount);
    }
  }

  let current = billed - paid;
  let outstanding = unbilled;
  if (current < 0) {
    // overpayment spills over to reduce the unbilled portion
    outstanding += current;
    current = 0;
  }
  if (outstanding < 0) outstanding = 0; // ponytail: clamp only, no credit-balance carry tracked

  return {
    current: round2(current),
    outstanding: round2(outstanding),
    total: round2(current + outstanding),
    cutoffDate: cutoff
  };
}

function computeNetWorth(accounts, transactions, today = new Date()) {
  let savings = 0, cardDebt = 0, loanDebt = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    if (a.type === 'savings') savings += computeSavingsBalance(a.id, transactions);
    else if (a.type === 'creditcard') cardDebt += computeCreditCard(a, transactions, today).total;
    else if (a.type === 'loan') loanDebt += Number(a.balance) || 0;
  }
  return {
    savings: round2(savings),
    cardDebt: round2(cardDebt),
    loanDebt: round2(loanDebt),
    netWorth: round2(savings - cardDebt - loanDebt)
  };
}

// Expenses in one month ('YYYY-MM'), totalled per person and per category.
function monthlySpending(transactions, month) {
  const out = { total: 0, p1: { total: 0, categories: {} }, p2: { total: 0, categories: {} } };
  for (const t of transactions) {
    if (t.voided || t.type !== 'expense' || !String(t.date).startsWith(month)) continue;
    const p = out[t.person];
    const amt = Number(t.amount);
    out.total += amt;
    if (!p) continue; // ponytail: rows without a person count only toward the total
    p.total += amt;
    const cat = t.category || 'Other';
    p.categories[cat] = round2((p.categories[cat] || 0) + amt);
  }
  out.total = round2(out.total);
  out.p1.total = round2(out.p1.total);
  out.p2.total = round2(out.p2.total);
  return out;
}

module.exports = {
  monthlySpending,
  round2,
  lastCutoffDate,
  computeSavingsBalance,
  computeCreditCard,
  computeNetWorth
};
