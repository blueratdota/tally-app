import { createContext, useContext } from 'react';
import { PEOPLE, CATEGORY_STYLES, type CategoryStyle } from './format';
export const PeopleContext = createContext(PEOPLE);
export const usePeople = () => useContext(PeopleContext);

export const CategoryContext = createContext(CATEGORY_STYLES);
const FALLBACK: CategoryStyle = { emoji: '🏷️', color: '#94a3b8' };
export const useCategoryStyle = () => { const styles = useContext(CategoryContext); return (name?: string) => styles[name || 'Other'] || FALLBACK; };

export function CategoryLabel({ name }: { name?: string }) {
  const { emoji, color } = useCategoryStyle()(name);
  return <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />{emoji && <span aria-hidden="true">{emoji}</span>}{name || 'Other'}</span>;
}
