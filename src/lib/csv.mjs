export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === delimiter || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== delimiter) { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (closed && !/\s/.test(c)) throw new Error('Invalid CSV: unexpected text after a quoted value');
    else if (c === '"') throw new Error('Invalid CSV: quote a value containing quotation marks');
    else if (!closed) field += c;
  }
  if (quoted) throw new Error('Invalid CSV: an unclosed quotation mark');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function stringifyCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let s = String(value ?? '');
    // Text from imports must never execute as a spreadsheet formula on export.
    if (typeof value !== 'number' && /^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
export function statementAmount(value) {
  const s = String(value ?? '').trim().replace(/₱|PHP/gi, '').replace(/[,\s]/g, '').replace(/−/g, '-');
  const raw = /^\(.*\)$/.test(s) ? '-' + s.slice(1, -1) : s;
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Invalid amount');
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n * 100))) throw new Error('Invalid amount');
  return n;
}
export function statementDate(value, format) {
  const s = String(value ?? '').trim(); let result;
  if (format === 'iso') result = s.slice(0, 10);
  else {
    const parts = s.split(/[\/.\-]/);
    if (parts.length !== 3 || !/^\d{4}$/.test(parts[2])) throw new Error('Use a four-digit year');
    const [a, b, year] = parts;
    result = `${year}-${(format === 'dmy' ? b : a).padStart(2, '0')}-${(format === 'dmy' ? a : b).padStart(2, '0')}`;
  }
  const d = new Date(result + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== result) throw new Error('Invalid date');
  return result;
}

export function statementTransaction(amountRaw, debit, credit, explicit, kind) {
  const debitAmount = debit ? statementAmount(debit) : 0;
  const creditAmount = credit ? statementAmount(credit) : 0;
  if (!amountRaw && debitAmount && creditAmount) throw new Error('A row cannot contain both a debit and a credit');
  let amount = amountRaw ? statementAmount(amountRaw) : Math.abs(debitAmount || creditAmount);
  let type;
  if (explicit) {
    const types = { income: 'income', credit: 'income', expense: 'expense', debit: 'expense', refund: 'expense', transfer: 'transfer' };
    if (!Object.hasOwn(types, explicit)) throw new Error('Type must be income, expense, transfer, debit, credit, or refund');
    type = types[explicit];
    if (explicit === 'refund') amount = -Math.abs(amount);
    else if (explicit !== 'expense') amount = Math.abs(amount);
  } else if (!amountRaw && (debit || credit)) type = debitAmount ? 'expense' : 'income';
  else if (kind === 'expense') type = 'expense';
  else { type = kind === 'income' ? 'income' : amount < 0 ? 'expense' : 'income'; amount = Math.abs(amount); }
  return { type, amount };
}
