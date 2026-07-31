import type { SortDirection } from '@/lib/useSort';

interface SortableThProps<K extends string> {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: SortDirection;
  onSort: (key: K) => void;
}

/** Clickable <th> for useSort() — shows an up/down indicator once its column is the active sort. */
export function SortableTh<K extends string>({ label, sortKey, activeKey, direction, onSort }: SortableThProps<K>) {
  const active = activeKey === sortKey;
  return (
    <th
      className="data-table__sortable-th"
      role="button"
      tabIndex={0}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
    >
      {label}
      <span className="data-table__sort-icon" aria-hidden="true">
        {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}
