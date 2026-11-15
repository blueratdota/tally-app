import { Children, type ReactNode } from 'react';
import { Plus, Pencil, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PageHead({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      <Button variant="outline" onClick={onAction}><Plus aria-hidden="true" />{action}</Button>
    </div>
  );
}

export function Rows({ empty, children }: { empty: string; children: ReactNode }) {
  const items = Children.toArray(children);
  return items.length
    ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items}</ul>
    : <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center"><Wallet className="size-8 mx-auto mb-3 text-muted-foreground" aria-hidden="true" /><p className="text-sm text-muted-foreground max-w-sm mx-auto">{empty}</p></div>;
}

interface RowProps { title: string; sub: ReactNode; amount: string; amountTone: string; onEdit: () => void; logo?: ReactNode; amountLabel?: string }

export function Row({ title, sub, amount, amountTone, onEdit, logo, amountLabel = 'Balance' }: RowProps) {
  return (
    <li className="min-w-0 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        {logo || <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Wallet className="size-5" aria-hidden="true" /></span>}
        <div className="min-w-0 flex-1 pt-1"><h3 className="font-semibold text-sm break-words">{title}</h3></div>
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={'Edit ' + title} className="-mr-2 -mt-2 text-muted-foreground"><Pencil aria-hidden="true" /></Button>
      </div>
      <div className="mt-6 mb-5"><p className="text-[11px] text-muted-foreground mb-1.5">{amountLabel}</p><p className={cn('text-2xl font-bold tracking-tight break-all', amountTone)}>{amount}</p></div>
      <div className="border-t pt-4 text-xs leading-relaxed text-muted-foreground break-words">{sub}</div>
    </li>
  );
}
