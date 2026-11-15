import React, { useState } from 'react';

export default function Unlock({ onUnlock, error }) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (value) onUnlock(value); }} className="max-w-xs mx-auto pt-24">
      <div className="font-display text-3xl font-bold tracking-tight mb-6">Tally</div>
      <label htmlFor="passcode" className="block text-sm text-muted mb-1">Household passcode</label>
      <input id="passcode" type="password" autoFocus autoComplete="current-password" value={value}
        onChange={e => setValue(e.target.value)}
        className="w-full bg-surface border border-line px-3 py-2.5 rounded-md outline-none focus:border-blue" />
      {error && <p className="text-red text-sm mt-2">{error}</p>}
      <button type="submit" className="w-full mt-4 bg-blue text-white font-medium py-2.5 rounded-md hover:bg-[#002a82]">Open Tally</button>
    </form>
  );
}
