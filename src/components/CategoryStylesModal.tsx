import { useContext, useState, type FormEvent } from 'react';
import { api, type HouseholdSettings } from '@/lib/api';
import { usePeople, CategoryContext } from '@/lib/household';
import { CATEGORIES, INCOME_CATEGORIES, CATEGORY_STYLES, styleOverrides } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function CategoryStylesModal({ onClose, onSaved }: { onClose: () => void; onSaved: (settings: HouseholdSettings) => void }) {
  const names = usePeople();
  const [styles, setStyles] = useState(useContext(CategoryContext));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { onSaved(await api.saveSettings({ names, categories: styleOverrides(styles) })); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const group = (legend: string, list: string[]) => (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {list.map(c => <div key={c} className="flex items-center gap-2">
        <Input aria-label={`${c} emoji`} className="w-14 text-center" maxLength={16} value={styles[c].emoji} onChange={e => setStyles({ ...styles, [c]: { ...styles[c], emoji: e.target.value } })} />
        <input type="color" aria-label={`${c} color`} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" value={styles[c].color} onChange={e => setStyles({ ...styles, [c]: { ...styles[c], color: e.target.value } })} />
        <span className="min-w-0 flex-1 truncate text-sm">{c}</span>
      </div>)}
    </fieldset>
  );
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="bg-card max-w-md max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>Category colors and emoji</DialogTitle></DialogHeader>
    <form onSubmit={save} className="grid gap-5">
      {group('Expense categories', CATEGORIES)}
      {group('Income categories', INCOME_CATEGORIES)}
      <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setStyles(CATEGORY_STYLES)}>Reset to defaults</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save categories'}</Button>
    </form>
  </DialogContent></Dialog>;
}
