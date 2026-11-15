import React from 'react';

export function PageHead({ title, action, onAction }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <button onClick={onAction} className="bg-blue text-white font-medium text-sm px-4 py-2 rounded-md hover:bg-[#002a82] active:scale-[0.98] transition">
        {action}
      </button>
    </div>
  );
}

export function Rows({ empty, children }) {
  const items = React.Children.toArray(children);
  return items.length
    ? <ul className="bg-surface border border-line rounded-md divide-y divide-line max-w-xl">{items}</ul>
    : <p className="text-muted text-sm max-w-xl">{empty}</p>;
}

export function Row({ title, sub, subTone = 'text-muted', amount, amountTone, onEdit, logo }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      {logo}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{title}</div>
        <div className={'text-sm ' + subTone}>{sub}</div>
      </div>
      <div className={'font-display text-lg font-semibold ' + amountTone}>{amount}</div>
      <button onClick={onEdit} aria-label={'Edit ' + title}
        className="text-sm text-blue font-medium px-2 py-1 -mr-2 rounded hover:underline">Edit</button>
    </li>
  );
}
