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
        'fixed bottom-6 left-1/2 -translate-x-1/2 px-[18px] py-3 rounded-lg text-[13px] border z-[60] transition-all ' +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none') +
        ' ' + (toast.isError ? 'border-coral bg-raised' : 'border-white/10 bg-raised')
      }
    >
      {toast.msg}
    </div>
  );
}
