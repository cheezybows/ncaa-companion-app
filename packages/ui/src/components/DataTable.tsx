export type DataTableProps = {
  headers: string[];
  rows: Array<Array<string | number>>;
  empty?: string;
};

export function DataTable({ headers, rows, empty = 'No data available.' }: DataTableProps) {
  if (rows.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
