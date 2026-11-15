const FREQUENCIES = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];
const iso = d => d.toISOString().slice(0, 10);
function occurrence(start, frequency, index) {
  const at = new Date(start + 'T00:00:00Z');
  if (['daily', 'weekly', 'fortnightly'].includes(frequency)) {
    at.setUTCDate(at.getUTCDate() + index * ({ daily: 1, weekly: 7, fortnightly: 14 }[frequency]));
  } else {
    const day = at.getUTCDate();
    at.setUTCMonth(at.getUTCMonth() + index * ({ monthly: 1, quarterly: 3, yearly: 12 }[frequency]), 1);
    const last = new Date(at); last.setUTCMonth(last.getUTCMonth() + 1, 0);
    at.setUTCDate(Math.min(day, last.getUTCDate()));
  }
  return iso(at);
}
function dueCharges(plan, through, existing) {
  const charges = [];
  if (!plan.active || plan.kind !== 'recurring') return charges;
  for (let i = 0; i < 10000; i++) {
    const date = occurrence(plan.start_date, plan.frequency, i);
    if (date > through || (plan.end_date && date > plan.end_date)) return charges;
    const id = `${plan.id}:${date}`;
    if (!existing.has(id)) charges.push({ id, date, type: 'expense', amount: Number(plan.amount), description: plan.description, category: plan.category, from_account_id: plan.account_id, to_account_id: '', person: plan.person, voided: false, plan_id: plan.id, plan_index: i + 1 });
  }
  throw new Error('This recurring schedule is too long. Choose a more recent start date.');
}
function nextChargeDate(plan, today) {
  if (!plan.active || plan.kind !== 'recurring') return '';
  for (let i = 0; i < 10000; i++) {
    const date = occurrence(plan.start_date, plan.frequency, i);
    if (plan.end_date && date > plan.end_date) return '';
    if (date > today) return date;
  }
  return '';
}
function transactionKey(t) {
  return JSON.stringify([t.date, t.type, Math.round(Number(t.amount) * 100), String(t.description).trim().toLowerCase(), t.from_account_id || '', t.to_account_id || '']);
}
module.exports = { FREQUENCIES, occurrence, dueCharges, transactionKey, nextChargeDate };
