import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

/** Generic client-side column sort — apply to an already-filtered list, before pagination. */
export function useSort<T, K extends string>(
  items: T[],
  getValue: (item: T, key: K) => string | number | null | undefined,
) {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [direction, setDirection] = useState<SortDirection>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    const copy = [...items];
    copy.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return direction === 'asc' ? va - vb : vb - va;
      }
      return direction === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return copy;
  }, [items, sortKey, direction, getValue]);

  const toggleSort = (key: K) => {
    if (sortKey === key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  };

  return { sorted, sortKey, direction, toggleSort };
}
