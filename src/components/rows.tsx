import { Children, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function PageHead({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <Button onClick={onAction}>{action}</Button>
    </div>
  );
}

export function Rows({ empty, children }: { empty: string; children: ReactNode }) {
  const items = Children.toArray(children);
  return items.length
    ? <Card className="max-w-xl"><ul className="divide-y">{items}</ul></Card>
    : <p className="text-muted-foreground text-sm max-w-xl">{empty}</p>;
}

interface RowProps { title: string; sub: ReactNode; amount: string; amountTone: string; onEdit: () => void; logo?: ReactNode }

export function Row({ title, sub, amount, amountTone, onEdit, logo }: RowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      {logo}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{title}</div>
        <div className="text-sm text-muted-foreground">{sub}</div>
      </div>
      <div className={cn('font-display text-lg font-semibold', amountTone)}>{amount}</div>
      <Button variant="link" size="sm" onClick={onEdit} aria-label={'Edit ' + title} className="-mr-2">Edit</Button>
    </li>
  );
}
