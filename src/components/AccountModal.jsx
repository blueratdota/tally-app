import React, { useState } from 'react';
import { api } from '../lib/api.js';

const LABELS = { creditcard: 'credit card', loan: 'loan', savings: 'savings account' };

export default function AccountModal({ type, account, onClose, onSaved }) {
  const [name, setName] = useState(account ? account.name : '');
  const [cutoffDay, setCutoffDay] = useState(account ? account.cutoff_day : '');
  const [dueDay, setDueDay] = useState(account ? account.due_day : '');
  const [balance, setBalance] = useState(account ? account.balance : '');
  const [logoPreview, setLogoPreview] = useState(account?.logo_url || '');
  const [logoDataUri, setLogoDataUri] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full bg-raised border border-white/10 text-paper px-3 py-2.5 rounded-lg text-sm outline-none focus:border-gold";
  const labelCls = "block text-[11px] uppercase tracking-wide text-muted mb-1.5 font-mono";

  function onLogoFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setLogoDataUri(reader.result); setLogoPreview(reader.result); };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let logo_url = account ? account.logo_url : '';
      if (type === 'creditcard' && logoDataUri) {
        logo_url = await api.uploadLogo(logoDataUri);
      }

      const fields = { name: name.trim() };
      if (type === 'creditcard') {
        fields.cutoff_day = Number(cutoffDay);
        fields.due_day = Number(dueDay);
        fields.logo_url = logo_url;
      }
      if (type === 'loan') {
        fields.balance = Number(balance);
      }

      if (account) {
        await api.updateAccount(account.id, fields);
      } else {
        await api.createAccount({ type, ...fields });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!account) return;
    if (!confirm('Remove this account? Its transaction history stays intact.')) return;
    try {
      await api.archiveAccount(account.id);
      onSaved('Removed');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-white/10 rounded-2xl w-full max-w-[440px] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[19px] m-0">{account ? 'Edit' : 'Add'} {LABELS[type]}</h2>
          <span onClick={onClose} className="cursor-pointer text-muted text-xl">×</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input type="text" required placeholder="e.g. BPI Gold, Toyota Loan, Emergency Fund"
              value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>

          {type === 'creditcard' && (
            <>
              <div>
                <label className={labelCls}>Cutoff day (1–31)</label>
                <input type="number" min="1" max="31" required placeholder="e.g. 15"
                  value={cutoffDay} onChange={e => setCutoffDay(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Due day (1–31)</label>
                <input type="number" min="1" max="31" required placeholder="e.g. 5"
                  value={dueDay} onChange={e => setDueDay(e.target.value)} className={inputCls} />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-14 h-9 rounded-md bg-raised border border-dashed border-white/10 flex items-center justify-center overflow-hidden text-[10px] text-muted shrink-0">
                  {logoPreview ? <img src={logoPreview} alt="" className="w-full h-full object-cover" /> : 'No logo'}
                </div>
                <div>
                  <input type="file" accept="image/*" onChange={onLogoFile} className="text-xs" />
                  <div className="text-[11px] text-muted mt-1">Optional — a photo or screenshot of the card works fine.</div>
                </div>
              </div>
            </>
          )}

          {type === 'loan' && (
            <div>
              <label className={labelCls}>Current balance (₱)</label>
              <input type="number" step="0.01" required placeholder="0.00"
                value={balance} onChange={e => setBalance(e.target.value)} className={inputCls} />
              <div className="text-[11px] text-muted mt-1">You can update this any time as the loan changes.</div>
            </div>
          )}

          {error && <div className="text-coral text-xs mt-1">{error}</div>}

          <button type="submit" disabled={saving} className="w-full bg-gold text-surface font-semibold text-sm py-2.5 rounded-lg mt-1 disabled:opacity-60 hover:bg-[#f7c866] active:scale-[0.98] transition">
            {saving ? 'Saving…' : 'Save'}
          </button>

          {account && (
            <button type="button" onClick={handleArchive} className="w-full bg-coral text-white font-semibold text-sm py-2.5 rounded-lg mt-1">
              Remove account
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
