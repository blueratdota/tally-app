import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Unlock({ onUnlock, error }: { onUnlock: (code: string) => void; error: string }) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (value) onUnlock(value); }} className="max-w-xs mx-auto pt-24 px-4">
      <div className="font-display text-3xl font-bold tracking-tight mb-6">Tally</div>
      <Label htmlFor="passcode" className="text-muted-foreground">Household passcode</Label>
      <Input id="passcode" type="password" autoFocus autoComplete="current-password" value={value}
        onChange={e => setValue(e.target.value)} className="mt-1 bg-card" />
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
      <Button type="submit" className="w-full mt-4">Open Tally</Button>
    </form>
  );
}
