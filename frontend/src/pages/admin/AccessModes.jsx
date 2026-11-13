// Frontend: what each access mode shows, and its adjustable name.
//
// A role answers "what may this account do"; an access mode answers "which
// objects can it reach in this session". The four modes and their order are
// fixed in code (app/services/rbac/seed_modes.py), and what each shows - its
// labels and field groups - is DERIVED from that order on the server and
// never stored. So this page shows those sets read-only and edits only a
// mode's name and description.
//
// There is nothing here about logged-out visitors. They always resolve to
// `safe`, which is what that mode means rather than something an
// administrator picks, so the page offers no control over it.
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

// Mirrors MODE_ORDER in app/services/rbac/seed_modes.py, narrowest first. The
// API orders by sort_order, which runs the other way, so the page sorts by
// key: the order is what decides what a mode shows, and reading the modes in
// it is what makes each one's sets read as a superset of the last.
export const MODE_ORDER = ["safe", "normal", "borderline", "unrestricted"];

// A key the code does not know sorts last rather than first.
function modeRank(key) {
  const rank = MODE_ORDER.indexOf(key);
  return rank === -1 ? MODE_ORDER.length : rank;
}

export function sortModes(modes) {
  return [...modes].sort((a, b) => modeRank(a.key) - modeRank(b.key));
}

function Chips({ keys, empty }) {
  if (keys.length === 0) {
    return <span className="text-xs text-text-faint italic">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => (
        <code
          key={key}
          className="text-[11px] bg-surface-2 text-text-muted rounded px-1.5 py-0.5"
        >
          {key}
        </code>
      ))}
    </div>
  );
}

function ModeCard({ mode, onSaved }) {
  const { showToast } = useToast();
  const [label, setLabel] = useState(mode.label);
  const [description, setDescription] = useState(mode.description ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    label !== mode.label || description !== (mode.description ?? "");

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetchJson(endpoints.accessModes.update(mode.system_id), {
        method: "PATCH",
        ...jsonBody({ label, description }),
      });
      showToast("success", `Saved ${label}.`);
      await onSaved();
    } catch (err) {
      showToast("error", err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={mode.key}
      className="border border-border rounded-lg p-4 bg-surface"
    >
      <form onSubmit={save} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <code className="text-[11px] bg-surface-2 rounded px-1.5 py-0.5">
            {mode.key}
          </code>
          <span className="text-[11px] text-text-faint">
            {mode.user_count} account(s)
          </span>
        </div>
        <label className="block text-xs font-semibold text-text-muted">
          Name
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full border border-border rounded px-2 py-1.5 text-sm font-normal bg-surface"
          />
        </label>
        <label className="block text-xs font-semibold text-text-muted">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full border border-border rounded px-2 py-1.5 text-sm font-normal bg-surface"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!dirty || saving}
            className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>

      <div className="mt-3 space-y-3 border-t border-border pt-3">
        <div>
          <h3 className="text-xs font-semibold text-text mb-1">
            <i className="fas fa-tags mr-2 text-text-faint"></i>Labels shown
          </h3>
          <Chips keys={mode.label_keys} empty="No labels." />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-text mb-1">
            <i className="fas fa-table-columns mr-2 text-text-faint"></i>Field
            groups shown
          </h3>
          <Chips keys={mode.field_group_keys} empty="No field groups." />
        </div>
      </div>
    </section>
  );
}

export default function AccessModes() {
  const { showToast } = useToast();
  const [modes, setModes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setModes(await fetchJson(endpoints.accessModes.list()));
    } catch (err) {
      showToast("error", err.message || "Could not load access modes.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const ordered = useMemo(() => sortModes(modes), [modes]);

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading access modes...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-eye-slash mr-2 text-brand"></i>Access Modes
        </h1>
        <p className="text-sm text-text-faint mt-1">
          A mode decides which <strong>entries</strong> and which{" "}
          <strong>fields</strong> a session can reach. It never grants a
          permission — what an account may <em>do</em> is its role. The modes
          and what each shows are defined in code, narrowest first; only a
          mode&apos;s name and description can be changed here.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ordered.map((mode) => (
          <ModeCard key={mode.system_id} mode={mode} onSaved={load} />
        ))}
      </div>
    </div>
  );
}
