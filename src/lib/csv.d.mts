export function parseCSV(text: string): string[][];
export function stringifyCSV(rows: unknown[][]): string;
export function statementAmount(value: unknown): number;
export function statementDate(value: unknown, format: string): string;
export function statementTransaction(amount: string, debit: string, credit: string, explicit: string, kind: string): { type: 'income' | 'expense' | 'transfer'; amount: number };
