// Frontend: the content-label reference.
//
// A label is a reason an entry might be restricted - "nsfw", "hentai". The
// labels, and the lowest access mode that shows each, are defined in code
// (app/services/rbac/labels.py), so this page reads them and edits nothing.
// Which modes show a label and which label it also carries come from the
// server, generated from that rule, so the page cannot describe a rule the
// server does not apply.
//
// Read by the admin, to see what a mode restriction does, and by super, who
// attaches the labels on the Add and Modify forms.
import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

function Chip({ children }) {
  return (
    <span className="inline-block text-[11px] bg-surface-2 text-text-muted rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

export default function ContentLabels() {
  const { showToast } = useToast();
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLabels(await fetchJson(endpoints.contentLabels.list()));
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading labels...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-tags mr-2 text-brand"></i>Content Labels
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Labels are defined in code. They are only attached to or detached
          from entries, collections, franchises and series, on the Add and
          Modify pages; a labelled entry is shown only in the modes listed
          beside its label, and a labelled group hides everything under it.
        </p>
      </header>

      {labels.length === 0 ? (
        <p className="text-sm text-text-faint italic">No labels defined.</p>
      ) : (
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead className="bg-surface-2 text-xs uppercase text-text-faint">
            <tr>
              <th className="text-left px-4 py-2">Label</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-left px-4 py-2">Shown in</th>
              <th className="text-right px-4 py-2">Entries</th>
              <th className="text-right px-4 py-2">Collections</th>
              <th className="text-right px-4 py-2">Franchises</th>
              <th className="text-right px-4 py-2">Series</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((row) => (
              <tr key={row.system_id} className="border-t border-border align-top">
                <td className="px-4 py-2">
                  <div className="font-medium text-text">{row.label}</div>
                  {/* The label's key, not a permission string: it is what the
                      Sheets tabs carry and what the server's rule is keyed on. */}
                  <code className="text-[11px] bg-surface-2 rounded px-1.5 py-0.5">
                    {row.key}
                  </code>
                  {row.also_carries.length > 0 && (
                    <div className="text-[11px] text-text-faint mt-1">
                      Also carries{" "}
                      {row.also_carries.map((key) => key.toUpperCase()).join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-text-muted">{row.description}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.modes.map((mode) => (
                      <Chip key={mode}>{mode}</Chip>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {row.entry_count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {row.collection_count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {row.franchise_count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {row.series_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
