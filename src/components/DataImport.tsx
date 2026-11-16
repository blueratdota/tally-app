import { useState, type ChangeEvent } from 'react';
import { api, type Account, type ImportPreview, type ImportRow, type Person } from '@/lib/api';
import { usePeople } from '@/lib/household';
import { peso } from '@/lib/format';
import { parseCSV, statementTransaction, statementDate, stringifyCSV } from '@/lib/csv.mjs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Transaction } from '@/lib/api';

export function exportTransactions(rows: Transaction[], accounts: Account[], names: Record<Person, string>) {
  const columns = ['id', 'date', 'type', 'amount', 'description', 'category', 'from_account_id', 'to_account_id', 'person', 'from_account', 'to_account', 'person_name'];
  const csv = stringifyCSV([columns, ...rows.map(t => [t.id, t.date, t.type, Number(t.amount), t.description, t.category || '', t.from_account_id || '', t.to_account_id || '', t.person || '', accounts.find(a => a.id === t.from_account_id)?.name || '', accounts.find(a => a.id === t.to_account_id)?.name || '', t.person ? names[t.person] : ''])]);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'tally-transactions.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const aliases: Record<string, string[]> = {
  date: ['date', 'period', 'transactiondate', 'posteddate'], description: ['description', 'note', 'notes', 'merchant', 'payee', 'details'], amount: ['amount', 'value', 'total'],
  type: ['type', 'transactiontype'], category: ['category'], person: ['person', 'personname'], from: ['fromaccountid', 'fromaccount'], to: ['toaccountid', 'toaccount'], id: ['id'], debit: ['debit', 'withdrawal', 'withdrawals'], credit: ['credit', 'deposit', 'deposits']
};

export default function DataImport({ accounts, defaultPerson, onClose, onSaved }: { accounts: Account[]; defaultPerson?: Person; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const names = usePeople(); const [headers, setHeaders] = useState<string[]>([]); const [data, setData] = useState<string[][]>([]); const [mapping, setMapping] = useState<Record<string, number>>({});
  const [account, setAccount] = useState(''); const [person, setPerson] = useState<Person>(defaultPerson || 'p1'); const [format, setFormat] = useState('iso'); const [kind, setKind] = useState('signed');
  const [preview, setPreview] = useState<ImportPreview[]>([]); const [selected, setSelected] = useState<number[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function file(e: ChangeEvent<HTMLInputElement>) {
    setError(''); setPreview([]);
    try {
      const chosen = e.target.files?.[0]; if (!chosen) return;
      if (chosen.size > 2 * 1024 * 1024) throw new Error('Choose a CSV smaller than 2 MB');
      const rows = parseCSV(await chosen.text()); if (rows.length < 2 || rows.length > 1001) throw new Error('Choose a header row and 1–1,000 transaction rows');
      const head = rows[0].map(h => h.trim()); const norm = head.map(h => h.toLowerCase().replace(/[ _-]/g, ''));
      if (new Set(norm).size !== norm.length) throw new Error('CSV headers must have different names');
      setHeaders(head); setData(rows.slice(1)); setMapping(Object.fromEntries(Object.entries(aliases).map(([key, options]) => [key, norm.findIndex(h => options.includes(h))])));
    } catch (err) { setError((err as Error).message); setData([]); }
  }
  function rows(): ImportRow[] {
    if (mapping.date < 0 || mapping.description < 0 || (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0)) throw new Error('Map a date, description, and amount (or debit/credit) column');
    const matchAccount = (value: string) => accounts.find(a => a.id === value || a.name.toLowerCase() === value.toLowerCase())?.id || '';
    return data.map((row, index) => {
      try {
        const value = (field: string) => mapping[field] >= 0 ? row[mapping[field]]?.trim() || '' : '';
        const { type, amount } = statementTransaction(value('amount'), value('debit'), value('credit'), value('type').toLowerCase(), kind);
        const who = value('person'); const resolvedPerson = (['p1', 'p2'] as const).find(p => p === who || names[p].toLowerCase() === who.toLowerCase());
        if (who && !resolvedPerson) throw new Error('Person does not match either household name');
        const from = value('from'), to = value('to');
        const tx: ImportRow = { type, amount, date: statementDate(value('date'), format), description: value('description'), person: resolvedPerson || person, category: value('category') || 'Other', id: value('id') || undefined };
        if (type !== 'income') tx.from_account_id = from ? matchAccount(from) || from : account;
        if (type !== 'expense') tx.to_account_id = to ? matchAccount(to) || to : type === 'income' ? account : '';
        return tx;
      } catch (err) { throw new Error(`CSV row ${index + 2}: ${(err as Error).message}`); }
    });
  }
  async function inspect() {
    setBusy(true); setError('');
    try { const res = await api.previewImport(rows()); setPreview(res.preview); setSelected(res.preview.filter(p => !p.error && !p.duplicate).map(p => p.index)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const result = await api.importTransactions(preview.filter(p => selected.includes(p.index) && p.transaction).map(p => ({ ...p.transaction!, include_duplicate: p.duplicate })));
      await onSaved(`Imported ${result.imported}; skipped ${result.skipped} duplicates`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="bg-card max-w-4xl"><DialogHeader><DialogTitle>Import transactions</DialogTitle></DialogHeader>
    <p className="text-xs text-muted-foreground">Import a CSV or TSV statement, map its columns, then review before saving. Amounts are in pesos. Potential duplicates are unchecked; include one only when it is a separate transaction.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-2"><Label htmlFor="csv-file">Statement file</Label><Input id="csv-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="h-auto py-3" onChange={file} /></div>
    {!!data.length && !preview.length && <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2"><Label htmlFor="csv-account">Default account</Label><Select value={account} onValueChange={setAccount}><SelectTrigger id="csv-account"><SelectValue placeholder="Choose an account" /></SelectTrigger><SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="csv-person">Default person</Label><Select value={person} onValueChange={v => setPerson(v as Person)}><SelectTrigger id="csv-person"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(names).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="csv-format">Date format</Label><Select value={format} onValueChange={setFormat}><SelectTrigger id="csv-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="iso">YYYY-MM-DD</SelectItem><SelectItem value="mdy">MM/DD/YYYY</SelectItem><SelectItem value="dmy">DD/MM/YYYY</SelectItem></SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor="csv-kind">When there is no type column</Label><Select value={kind} onValueChange={setKind}><SelectTrigger id="csv-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="signed">Negative = expense; positive = income</SelectItem><SelectItem value="expense">Expenses (negative = refund)</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></div>
        {Object.keys(aliases).map(field => <div className="grid gap-2" key={field}><Label htmlFor={`map-${field}`}>Column: {field}</Label><Select value={String(mapping[field] ?? -1)} onValueChange={v => setMapping({ ...mapping, [field]: Number(v) })}><SelectTrigger id={`map-${field}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-1">Not in file</SelectItem>{headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}</SelectContent></Select></div>)}
      </div>
      <p className="text-xs text-muted-foreground">{data.length} rows. Transfers need source and destination columns. Exported Tally CSVs map automatically.</p><Button disabled={busy} onClick={inspect}>{busy ? 'Checking…' : 'Preview import'}</Button>
    </>}
    {!!preview.length && <>
      <p className="text-sm">{selected.length} selected · {preview.filter(p => p.duplicate).length} potential duplicates · {preview.filter(p => p.error).length} invalid rows</p>
      <div className="max-h-80 overflow-auto rounded-xl border" tabIndex={0} role="region" aria-label="Import preview"><table className="w-full min-w-[580px] text-xs"><thead className="bg-muted"><tr>{['Include', 'Row', 'Date', 'Description', 'Amount', 'Review'].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{preview.map(p => <tr key={p.index} className="border-t"><td className="p-3"><input type="checkbox" className="size-5 accent-primary" aria-label={`Include CSV row ${p.index + 2}`} disabled={!!p.error} checked={selected.includes(p.index)} onChange={e => setSelected(e.target.checked ? [...selected, p.index] : selected.filter(i => i !== p.index))} /></td><td className="p-3">{p.index + 2}</td><td className="p-3 whitespace-nowrap">{p.transaction?.date}</td><td className="p-3 break-words">{p.transaction?.description || 'Invalid row'}</td><td className="p-3 whitespace-nowrap">{p.transaction && peso(p.transaction.amount)}</td><td className="p-3">{p.error || (p.duplicate ? 'Potential duplicate' : 'Ready')}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap gap-2"><Button onClick={save} disabled={busy || !selected.length}>{busy ? 'Importing…' : `Import ${selected.length} selected`}</Button><Button variant="ghost" onClick={() => setPreview([])} disabled={busy}>Change mapping</Button></div>
    </>}
  </DialogContent></Dialog>;
}
