import { useState } from 'react';
import { ChartNoAxesColumnIncreasing, ArrowRight, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Unlock({ onUnlock, error }: { onUnlock: (code: string) => void; error: string }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5 py-10">
      <form onSubmit={e => { e.preventDefault(); if (value) onUnlock(value); }} className="w-full max-w-sm rounded-3xl border bg-card p-7 sm:p-9">
        <div className="flex items-center gap-3 mb-10"><span className="brand-mark"><ChartNoAxesColumnIncreasing className="size-5" aria-hidden="true" /></span><span className="text-3xl font-extrabold tracking-tight">tally<span className="text-primary">.</span></span></div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome home.</h1>
        <p className="text-sm text-muted-foreground mt-2 mb-8">Your household money, all in one place.</p>
        <Label htmlFor="passcode">Household passcode</Label>
        <Input id="passcode" type="password" autoComplete="current-password" value={value} onChange={e => setValue(e.target.value)} className="mt-2" />
        {error && <p role="alert" className="text-destructive text-sm mt-2">{error}</p>}
        <Button type="submit" className="w-full mt-5 h-12">Open Tally<ArrowRight aria-hidden="true" /></Button>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground mt-6"><LockKeyhole className="size-3" aria-hidden="true" />Your shared household space</p>
      </form>
    </div>
  );
}
