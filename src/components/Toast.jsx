import React, { useEffect, useState } from 'react';

export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className={
        'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-md text-sm border z-[60] transition-all text-white ' +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none') +
        ' ' + (toast.isError ? 'border-red bg-red' : 'border-ink bg-ink')
      }
    >
      {toast.msg}
    </div>
  );
}
