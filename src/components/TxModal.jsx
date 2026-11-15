import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, PEOPLE, localDate } from '../lib/format.js';

const LAST_PERSON = 'tally-person';
const lastPerson = () => { try { return localStorage.getItem(LAST_PERSON) || ''; } catch { return ''; } };

function accountOptions(list, showGroup) {
  if (!list.length) return <option value="">No accounts yet — add one first</option>;
  return list.map(a => (
    <option key={a.id} value={a.id}>{a.name}{showGroup && a.group ? ` (${a.group})` : ''}</option>
  ));
}

export default function TxModal({ accounts, onClose, onSaved, showError }) {
  const [type, setType] = useState('income');
  const [date, setDate] = useState(localDate());
  const [person, setPerson] = useState(lastPerson());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const savings = accounts.filter(a => a.type === 'savings');
  const cards = accounts.filter(a => a.type === 'creditcard');
  const loans = accounts.filter(a => a.type === 'loan');
  const chargeable = [...savings.map(a => ({ ...a, group: 'Savings' })), ...cards.map(a => ({ ...a, group: 'Credit Card' }))];
  const destinations = [...savings.map(a => ({ ...a, group: 'Savings' })), ...cards.map(a => ({ ...a, group: 'Credit Card' })), ...loans.map(a => ({ ...a, group: 'Loan' }))];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!person) { setError('Choose who this is for.'); return; }
    try { localStorage.setItem(LAST_PERSON, person); } catch {}
    const payload = { type, date, person, amount: parseFloat(amount), description: description.trim() };
    if (type === 'income') {
      payload.to_account_id = toAccount;
    } else if (type === 'expense') {
      payload.from_account_id = fromAccount;
      payload.category = category;
    } else {
      payload.from_account_id = fromAccount;
      payload.to_account_id = toAccount;
      if (fromAccount && fromAccount === toAccount) {
        setError("Source and destination can't be the same account.");
        return;
      }
    }

    setSaving(true);
    try {
      await api.createTransaction(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full bg-ground border border-line text-ink px-3 py-2.5 rounded-lg text-sm outline-none focus:border-blue";
  const labelCls = "block text-sm text-muted mb-1";

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-lg w-full max-w-[440px] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Record transaction</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted text-2xl leading-none">×</button>
        </div>

        <div className="flex gap-1.5 mb-[18px]">
          {['income', 'expense', 'transfer'].map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={'flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition ' +
                (type === t ? 'bg-blue text-white border-blue' : 'bg-ground text-muted border-line')}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <fieldset>
            <legend className={labelCls}>Who</legend>
            <div className="flex gap-1.5">
              {Object.entries(PEOPLE).map(([id, name]) => (
                <button key={id} type="button" onClick={() => setPerson(id)} aria-pressed={person === id}
                  className={'flex-1 py-2 rounded-lg text-sm font-medium border transition ' +
                    (person === id ? 'bg-ink text-white border-ink' : 'bg-surface text-muted border-line')}>
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
          <div><label className={labelCls}>Date</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Amount (₱)</label><input type="number" step="0.01" min="0.01" required placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Description</label><input type="text" required placeholder="e.g. Salary, Grocery run, Card payment" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} /></div>

          {type === 'income' && (
            <div><label className={labelCls}>Deposit into</label>
              <select required value={toAccount} onChange={e => setToAccount(e.target.value)} className={inputCls}>
                <option value="" disabled>Select account</option>{accountOptions(savings)}
              </select>
            </div>
          )}

          {type === 'expense' && (
            <>
              <div><label className={labelCls}>Charge to</label>
                <select required value={fromAccount} onChange={e => setFromAccount(e.target.value)} className={inputCls}>
                  <option value="" disabled>Select account</option>{accountOptions(chargeable, true)}
                </select>
              </div>
              <div><label className={labelCls}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}

          {type === 'transfer' && (
            <>
              <div><label className={labelCls}>From (savings)</label>
                <select required value={fromAccount} onChange={e => setFromAccount(e.target.value)} className={inputCls}>
                  <option value="" disabled>Select account</option>{accountOptions(savings)}
                </select>
              </div>
              <div><label className={labelCls}>To</label>
                <select required value={toAccount} onChange={e => setToAccount(e.target.value)} className={inputCls}>
                  <option value="" disabled>Select account</option>{accountOptions(destinations, true)}
                </select>
              </div>
            </>
          )}

          {error && <div className="text-red text-xs mt-1">{error}</div>}

          <button type="submit" disabled={saving} className="w-full bg-blue text-white font-semibold text-sm py-2.5 rounded-lg mt-1 disabled:opacity-60 hover:bg-[#002a82] active:scale-[0.98] transition">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
