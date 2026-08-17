import { useLanguage } from '@/i18n/useLanguage';

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (pageCount <= 1) return null;

  return (
    <div className="pagination">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={t.pagination.previousPage}
      >
        {t.pagination.prev}
      </button>
      <span>{t.pagination.pageOf(page, pageCount)}</span>
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        aria-label={t.pagination.nextPage}
      >
        {t.pagination.next}
      </button>
    </div>
  );
}
