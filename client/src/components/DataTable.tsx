interface DataTableProps {
  columns: string[];
  rows: (string | number | null)[][];
}

// Renders a result set / sample table. NULL is shown explicitly (never as empty text),
// matching the "NULL is a distinct value" rule.
export function DataTable({ columns, rows }: DataTableProps) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="empty" colSpan={columns.length || 1}>
                (aucune ligne)
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>
                    {cell === null ? <span className="null-cell">NULL</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
