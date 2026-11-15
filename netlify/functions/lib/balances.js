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

// Local YYYY-MM-DD, comparable as a string against transaction dates.
const isoDate = d => d.toLocaleDateString('en-CA');

// Savings balance = every transaction that lands on or leaves this account.
// Future-dated transactions (e.g. scheduled installments) don't count yet.
function computeSavingsBalance(accountId, transactions, today = new Date()) {
  const todayStr = isoDate(today);
  let bal = 0;
  for (const t of transactions) {
    if (t.voided || t.date > todayStr) continue;
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
  const todayStr = isoDate(today);
  const nextMonth = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1)).slice(0, 7);
  let billed = 0, unbilled = 0, paid = 0, future = 0, dueNextMonth = 0;

  for (const t of transactions) {
    if (t.voided) continue;
    if (t.type === 'expense' && t.from_account_id === account.id) {
      if (t.date > todayStr) { // scheduled ahead (installments): tracked apart from today's debt
        future += Number(t.amount);
        if (t.date.startsWith(nextMonth)) dueNextMonth += Number(t.amount);
        continue;
      }
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
    future: round2(future),             // all scheduled charges still to come
    dueNextMonth: round2(dueNextMonth), // the part of that landing next calendar month
    cutoffDate: cutoff
  };
}

function computeNetWorth(accounts, transactions, today = new Date()) {
  let savings = 0, cardDebt = 0, loanDebt = 0, futureDebt = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    if (a.type === 'savings') savings += computeSavingsBalance(a.id, transactions, today);
    else if (a.type === 'creditcard') {
      const c = computeCreditCard(a, transactions, today);
      cardDebt += c.total;
      futureDebt += c.future;
    } else if (a.type === 'loan') loanDebt += Number(a.balance) || 0;
  }
  return {
    savings: round2(savings),
    cardDebt: round2(cardDebt),
    futureDebt: round2(futureDebt), // not part of netWorth: scheduled card charges still to come
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
