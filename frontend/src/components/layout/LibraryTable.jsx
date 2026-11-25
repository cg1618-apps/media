// Frontend: the table view every library draws - the media libraries
// (LibraryLayout, columns from libraryColumns.jsx and each type's config), the
// franchise and series libraries, and the entity libraries (entityColumns.jsx).
// Hairline rows under mono headers, the header row pinned while the body
// scrolls.
//
// A column is { key, header, render(row, ctx), thClass?, tdClass?,
// stopPropagation? }: `render` gets the row and `ctx`, whatever lookups the
// library's columns read; `stopPropagation` keeps a click on a control in the
// cell from opening the row. A row opens `rowPath(row)` when that returns a
// path, else calls `onRowClick(row)` when given; a row with neither is inert.
import { useNavigate } from "react-router-dom";

export default function LibraryTable({
  columns,
  rows,
  ctx = {},
  rowPath,
  onRowClick,
  rowKey = (row) => row.system_id,
}) {
  const navigate = useNavigate();
  return (
    <div className="bg-surface border border-border overflow-auto max-h-[75vh]">
      <table className="w-full text-left">
        <thead className="bg-surface border-b border-border sticky top-0 z-10">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 font-mono text-[10px] font-normal text-text-faint text-center ${
                  i < columns.length - 1 ? "border-r border-border" : ""
                } ${col.thClass ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const path = rowPath?.(row);
            const open = path ? () => navigate(path) : onRowClick ? () => onRowClick(row) : null;
            return (
              <tr
                key={rowKey(row)}
                onClick={open ?? undefined}
                className={`transition-colors ${open ? "hover:bg-surface-2 cursor-pointer" : ""}`}
              >
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 ${
                      i < columns.length - 1 ? "border-r border-border" : ""
                    } ${col.tdClass ?? ""}`}
                    onClick={col.stopPropagation ? (e) => e.stopPropagation() : undefined}
                  >
                    {col.render(row, ctx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
