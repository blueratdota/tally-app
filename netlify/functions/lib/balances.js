// Pure functions: given accounts + transactions, derive every balance shown
// in the app. No network/sheet calls here, so this file can be unit-tested
// in isolation (see test/balances.test.js).

// Keep the household calendar consistent with peso accounts, including on UTC hosts.
function householdToday(now = new Date()) {
  return new Date(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) + 'T12:00:00');
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// The most recent date matching `cutoffDay` that is on or before `today`.
// Clamps to the actual last day of a short month (e.g. cutoffDay=31 in Feb).
function lastCutoffDate(cutoffDay, today = householdToday()) {
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
function computeSavingsBalance(accountId, transactions, today = householdToday()) {
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
function computeCreditCard(account, transactions, today = householdToday()) {
  const cutoff = lastCutoffDate(account.cutoff_day, today);
  const todayStr = isoDate(today);
  const nextMonth = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1)).slice(0, 7);
  let billed = 0, unbilled = 0, paid = 0, future = 0, dueNextMonth = 0;
  const statements = new Map();

  for (const t of transactions) {
    if (t.voided) continue;
    // Transfers out of a card (loan payments charged to it) are card charges too.
    if ((t.type === 'expense' || t.type === 'transfer') && t.from_account_id === account.id) {
      if (t.date > todayStr) { // scheduled ahead (installments): tracked apart from today's debt
        future += Number(t.amount);
        if (t.date.startsWith(nextMonth)) dueNextMonth += Number(t.amount);
        continue;
      }
      const d = new Date(t.date + 'T00:00:00');
      if (d <= cutoff) {
        billed += Number(t.amount);
        if (Number(t.amount) > 0) {
          let statement = lastCutoffDate(account.cutoff_day, d);
          if (d > statement) statement = new Date(statement.getFullYear(), statement.getMonth() + 1, Math.min(Number(account.cutoff_day), daysInMonth(statement.getFullYear(), statement.getMonth() + 1)));
          const key = isoDate(statement);
          statements.set(key, (statements.get(key) || 0) + Math.round(Number(t.amount) * 100));
        }
      }
      else unbilled += Number(t.amount);
    }
    // Payments (transfers) and credits recorded as income (refunds, rebates, cashback) both pay the card down.
    if ((t.type === 'transfer' || t.type === 'income') && t.to_account_id === account.id && t.date <= todayStr) {
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

  let dueDate = null, daysUntilDue = null;
  if (round2(current) > 0 && Number(account.due_day) >= 1 && Number(account.due_day) <= 31) {
    // Payments and billed refunds clear the oldest statement first.
    let credits = Math.round(paid * 100) + [...statements.values()].reduce((n, amount) => n + amount, 0) - Math.round(billed * 100);
    for (const [date, amount] of [...statements].sort(([a], [b]) => a.localeCompare(b))) {
      if (credits >= amount) { credits -= amount; continue; }
      const statement = new Date(date + 'T00:00:00');
      const dueAt = month => new Date(statement.getFullYear(), month, Math.min(Number(account.due_day), daysInMonth(statement.getFullYear(), month)));
      let due = dueAt(statement.getMonth());
      if (due <= statement) due = dueAt(statement.getMonth() + 1);
      dueDate = isoDate(due);
      daysUntilDue = Math.round((Date.parse(dueDate) - Date.parse(todayStr)) / 864e5);
      break;
    }
  }

  return {
    current: round2(current),
    outstanding: round2(outstanding),
    total: round2(current + outstanding),
    future: round2(future),             // all scheduled charges still to come
    dueNextMonth: round2(dueNextMonth), // the part of that landing next calendar month
    dueDate,
    daysUntilDue,
    cutoffDate: cutoff
  };
}

// What a loan still needs this calendar month: the monthly payment less transfers
// already made into it this month, never more than what is left on the loan.
// ponytail: payments count by calendar month, so one made before the 1st for this month's due date isn't credited.
function computeLoanDue(account, transactions, today = householdToday()) {
  const monthly = Number(account.monthly_payment) || 0, day = Number(account.due_day);
  if (!(monthly > 0) || !(day >= 1 && day <= 31)) return { dueThisMonth: null, dueDate: null, daysUntilDue: null, paymentsLeft: null, lastDueDate: null };
  const todayStr = isoDate(today), month = todayStr.slice(0, 7);
  let paid = 0;
  for (const t of transactions) {
    if (!t.voided && t.type === 'transfer' && t.to_account_id === account.id && t.date <= todayStr && t.date.startsWith(month)) paid += Number(t.amount);
  }
  const owedAtMonthStart = Math.max(Number(account.balance) || 0, 0) + paid; // stored balance already has this month's payments taken off
  const dueOn = m => isoDate(new Date(today.getFullYear(), m, Math.min(day, daysInMonth(today.getFullYear(), m))));
  const dueDate = dueOn(today.getMonth());
  const dueThisMonth = round2(Math.max(Math.min(monthly, owedAtMonthStart) - paid, 0));
  // Payments still to make, the last one smaller if the balance doesn't divide evenly.
  const balance = Math.max(Number(account.balance) || 0, 0);
  const paymentsLeft = Math.ceil(round2(balance / monthly));
  const firstMonth = today.getMonth() + (dueThisMonth > 0 ? 0 : 1);
  return {
    dueThisMonth,
    dueDate,
    daysUntilDue: Math.round((Date.parse(dueDate) - Date.parse(todayStr)) / 864e5),
    paymentsLeft,
    lastDueDate: paymentsLeft ? dueOn(firstMonth + paymentsLeft - 1) : null
  };
}

function computeNetWorth(accounts, transactions, today = householdToday()) {
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
function monthlySpending(transactions, month, today = householdToday()) {
  const todayStr = isoDate(today);
  const out = { total: 0, p1: { total: 0, categories: {} }, p2: { total: 0, categories: {} } };
  for (const t of transactions) {
    if (t.voided || t.date > todayStr || t.type !== 'expense' || t.category === 'Balance adjustment' || !String(t.date).startsWith(month)) continue;
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

// Net worth at the end of each of the last `months` months (the current month ends today).
// ponytail: loans have no history (stored balance), so every point uses today's loan balance.
function netWorthHistory(accounts, transactions, months = 12, today = householdToday()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const end = i === 0 ? today : new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    out.push({ month: isoDate(end).slice(0, 7), netWorth: computeNetWorth(accounts, transactions, end).netWorth });
  }
  return out;
}

module.exports = {
  householdToday,
  monthlySpending,
  netWorthHistory,
  round2,
  lastCutoffDate,
  computeSavingsBalance,
  computeCreditCard,
  computeLoanDue,
  computeNetWorth
};
