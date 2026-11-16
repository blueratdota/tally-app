import { useContext, useState, type FormEvent } from 'react';
import { api, type HouseholdSettings } from '@/lib/api';
import { usePeople, CategoryContext } from '@/lib/household';
import { styleOverrides } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function SettingsModal({ onClose, onSaved, onEditCategories }: { onClose: () => void; onSaved: (settings: HouseholdSettings) => void; onEditCategories: () => void }) {
  const people = usePeople();
  const styles = useContext(CategoryContext);
  const [names, setNames] = useState(people);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    // The settings endpoint saves names and category styles together, so send the current styles unchanged.
    try { onSaved(await api.saveSettings({ names, categories: styleOverrides(styles) })); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent className="bg-card max-w-md max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>Household settings</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">These settings appear throughout the app and sync across your devices. Existing transactions stay linked to the same person.</p>
    <form onSubmit={save} className="grid gap-4">
      {(['p1', 'p2'] as const).map((id, i) => <div key={id} className="grid gap-2"><Label htmlFor={`name-${id}`}>Person {i + 1} name</Label><Input id={`name-${id}`} required maxLength={40} value={names[id]} onChange={e => setNames({ ...names, [id]: e.target.value })} /></div>)}
      <Button type="button" variant="outline" onClick={onEditCategories}>Category colors and emoji…</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
    </form>
  </DialogContent></Dialog>;
}
