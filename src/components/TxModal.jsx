import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES } from '../lib/format.js';

function accountOptions(list, showGroup) {
  if (!list.length) return <option value="">No accounts yet — add one first</option>;
  return list.map(a => (
    <option key={a.id} value={a.id}>{a.name}{showGroup && a.group ? ` (${a.group})` : ''}</option>
  ));
}

export default function TxModal({ accounts, onClose, onSaved, showError }) {
  const [type, setType] = useState('income');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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

    const payload = { type, date, amount: parseFloat(amount), description: description.trim() };
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

  const inputCls = "w-full bg-raised border border-white/10 text-paper px-3 py-2.5 rounded-lg text-sm outline-none focus:border-gold";
  const labelCls = "block text-[11px] uppercase tracking-wide text-muted mb-1.5 font-mono";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-[440px] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[19px] m-0">Add money movement</h2>
          <span onClick={onClose} className="cursor-pointer text-muted text-xl">×</span>
        </div>

        <div className="flex gap-1.5 mb-[18px]">
          {['income', 'expense', 'transfer'].map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={'flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition ' +
                (type === t ? 'bg-gold text-surface border-gold' : 'bg-raised text-muted border-white/10')}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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

          {error && <div className="text-coral text-xs mt-1">{error}</div>}

          <button type="submit" disabled={saving} className="w-full bg-gold text-surface font-semibold text-sm py-2.5 rounded-lg mt-1 disabled:opacity-60 hover:bg-[#f7c866] active:scale-[0.98] transition">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
