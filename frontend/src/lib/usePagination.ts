import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side pagination over an already-filtered array. Resets to page 1 whenever the
 * input array reference/length changes (e.g. a new search query narrows the results) so the
 * user never lands on a stale, now-empty page.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const clampedPage = Math.min(page, pageCount);

  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  return { page: clampedPage, setPage, pageCount, pageItems, total: items.length };
}
