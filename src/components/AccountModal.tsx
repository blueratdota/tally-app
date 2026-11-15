import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api, type Account, type AccountFields, type AccountType, type Owner } from '@/lib/api';
import { PEOPLE } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

const LABELS: Record<AccountType, string> = { creditcard: 'credit card', loan: 'loan', savings: 'savings account' };

interface Props { type: AccountType; account: Account | null; onClose: () => void; onSaved: (msg?: string) => void }

export default function AccountModal({ type, account, onClose, onSaved }: Props) {
  const [name, setName] = useState(account?.name ?? '');
  const [owner, setOwner] = useState<Owner>(account?.owner || 'shared');
  const [cutoffDay, setCutoffDay] = useState(String(account?.cutoff_day ?? ''));
  const [dueDay, setDueDay] = useState(String(account?.due_day ?? ''));
  const [balance, setBalance] = useState(String(account?.balance ?? ''));
  const [logoPreview, setLogoPreview] = useState(account?.logo_url || '');
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function onLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setLogoDataUri(reader.result as string); setLogoPreview(reader.result as string); };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let logo_url = account?.logo_url ?? '';
      if (type === 'creditcard' && logoDataUri) logo_url = await api.uploadLogo(logoDataUri);

      const fields: AccountFields = { name: name.trim(), owner };
      if (type === 'creditcard') {
        fields.cutoff_day = Number(cutoffDay);
        fields.due_day = Number(dueDay);
        fields.logo_url = logo_url;
      }
      if (type === 'loan') fields.balance = Number(balance);

      if (account) await api.updateAccount(account.id, fields);
      else await api.createAccount({ type, ...fields });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!account) return;
    try {
      await api.archiveAccount(account.id);
      onSaved('Removed');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-xl">{account ? 'Edit' : 'Add'} {LABELS[type]}</DialogTitle></DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required placeholder="e.g. BPI Gold, Toyota Loan, Emergency Fund" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="owner">Whose is it</Label>
            <Select value={owner} onValueChange={v => setOwner(v as Owner)}>
              <SelectTrigger id="owner"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PEOPLE).map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'creditcard' && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="cutoff">Cutoff day (1–31)</Label>
                <Input id="cutoff" type="number" min="1" max="31" required placeholder="e.g. 15" value={cutoffDay} onChange={e => setCutoffDay(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="due">Due day (1–31)</Label>
                <Input id="due" type="number" min="1" max="31" required placeholder="e.g. 5" value={dueDay} onChange={e => setDueDay(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-14 h-9 rounded-md bg-muted border border-dashed flex items-center justify-center overflow-hidden text-[10px] text-muted-foreground shrink-0">
                  {logoPreview ? <img src={logoPreview} alt="" className="w-full h-full object-cover" /> : 'No logo'}
                </div>
                <div className="min-w-0 flex-1">
                  <input type="file" accept="image/*" onChange={onLogoFile} className="w-full min-w-0 text-xs" aria-label="Card logo" />
                  <div className="text-[11px] text-muted-foreground mt-1">Optional — a photo or screenshot of the card works fine.</div>
                </div>
              </div>
            </>
          )}

          {type === 'loan' && (
            <div className="grid gap-1.5">
              <Label htmlFor="balance">Current balance (₱)</Label>
              <Input id="balance" type="number" step="0.01" required placeholder="0.00" value={balance} onChange={e => setBalance(e.target.value)} />
              <div className="text-[11px] text-muted-foreground">You can update this any time as the loan changes.</div>
            </div>
          )}

          {error && <div className="text-destructive text-xs">{error}</div>}

          <Button type="submit" disabled={saving} className="w-full mt-1">{saving ? 'Saving…' : 'Save'}</Button>

          {account && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" className="w-full">Remove account</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {account.name}?</AlertDialogTitle>
                  <AlertDialogDescription>Its transaction history stays intact.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
