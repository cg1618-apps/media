// Frontend: confirms the franchise and series an entry's save will create.
//
// An Add or Modify form that names a franchise or series which does not exist
// asks here before the entry is saved, so neither is minted without a yes.
// The dialog shows what will be written, as editable fields: each group's
// five names, filled from the entry's (lib/groupQuickCreate.js), and the
// franchise's types - the one the entry's media type implies is ticked and
// cannot be unticked, and any other type of its family may be added. Confirm
// hands back the edited names and types; nothing is created until then.
//
// It asks nothing else: an expectation is the viewer's own, set on the
// group's page, and a 備註 Remark is added in its Notes card once it exists.
import { useState } from "react";

import { inputCls } from "../forms/FormField";
import { Button, Eyebrow } from "../ui/primitives";
import { GROUP_NAME_KEYS, hasAnyName, orderTypes } from "../../lib/groupQuickCreate";

const NAME_LABELS = { en: "EN", cn: "CN", roman: "Roman", jp: "JP", alt: "Alt" };

function NameFields({ kind, names, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {GROUP_NAME_KEYS.map((key) => (
        <label key={key} className="block">
          <span className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
            Name {NAME_LABELS[key]}
          </span>
          <input
            aria-label={`${kind} name ${NAME_LABELS[key]}`}
            className={inputCls}
            value={names[key]}
            onChange={(e) => onChange({ ...names, [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function TypeChoices({ offered, types, locked, onChange }) {
  return (
    <fieldset>
      <legend className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
        Franchise Type
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {offered.map((t) => {
          const checked = types.includes(t);
          const isLocked = locked.includes(t);
          return (
            <label
              key={t}
              className={`flex items-center gap-1.5 text-sm font-medium ${
                isLocked ? "text-text-muted" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isLocked}
                onChange={() =>
                  onChange(
                    orderTypes(
                      checked ? types.filter((x) => x !== t) : [...types, t],
                      offered,
                    ),
                  )
                }
                className="rounded accent-brand"
              />
              {t}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * `franchise` - `{ names, types, lockedTypes }`, or null when the entry's
 * franchise exists. `series` - `{ names, text }`, or null likewise.
 * `franchiseTypes` - the types the franchise may be given.
 * `onConfirm({ franchise: { names, types } | null, series: { names } | null })`.
 */
export default function GroupCreateModal({
  franchise,
  series,
  franchiseTypes = [],
  onConfirm,
  onCancel,
}) {
  const [franchiseNames, setFranchiseNames] = useState(franchise?.names);
  const [types, setTypes] = useState(() =>
    franchise ? orderTypes([...franchise.types, ...(franchise.lockedTypes ?? [])], franchiseTypes) : [],
  );
  const [seriesNames, setSeriesNames] = useState(series?.names);

  const title = franchise && series ? "franchise and series" : franchise ? "franchise" : "series";
  const ready =
    (!franchise || hasAnyName(franchiseNames)) && (!series || hasAnyName(seriesNames));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Create new ${title}`}
        className="bg-surface border border-border shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Create new {title}
          </h3>
        </div>
        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          <p className="text-sm text-text-muted">
            Filled in from the entry&apos;s names. Edit them as needed; nothing
            is created until you confirm, then the entry is saved.
          </p>
          {franchise && (
            <section className="space-y-3">
              <Eyebrow as="h4">Franchise</Eyebrow>
              <NameFields kind="Franchise" names={franchiseNames} onChange={setFranchiseNames} />
              <TypeChoices
                offered={franchiseTypes}
                types={types}
                locked={franchise.lockedTypes ?? []}
                onChange={setTypes}
              />
            </section>
          )}
          {series && (
            <section className="space-y-3">
              <Eyebrow as="h4">Series</Eyebrow>
              {series.text && (
                <p className="text-sm text-text-muted">
                  &quot;<span className="font-semibold text-text">{series.text}</span>&quot;
                  does not match any existing series.
                </p>
              )}
              <NameFields kind="Series" names={seriesNames} onChange={setSeriesNames} />
            </section>
          )}
          {!ready && (
            <p className="text-sm text-danger">Give each new group at least one name.</p>
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            kind="primary"
            disabled={!ready}
            onClick={() =>
              onConfirm({
                franchise: franchise ? { names: franchiseNames, types } : null,
                series: series ? { names: seriesNames } : null,
              })
            }
          >
            Create and proceed
          </Button>
        </div>
      </div>
    </div>
  );
}
