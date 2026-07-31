interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

/** Shimmering placeholder rows shown in a <div className="table-wrap"> while a table query is loading. */
export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table className="data-table">
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((__, colIndex) => (
                <td key={colIndex}>
                  <span className="skeleton-bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
