// Frontend: define what each level of access may see.
//
// The permission grid is built from GET /api/roles/catalog rather than from a
// list kept here, so the checkboxes cannot drift from what the server will
// accept - a new content label or field group appears on this page without a
// frontend change.
//
// Grants are saved as a whole set. Unticking a box means "not this", which an
// append-only save could not express.
//
// Some boxes are not the admin's to decide, and which ones is served per role
// as locked_on / locked_off rather than decided here - the same table the PUT
// enforces with a 409, so a box that looks editable can never be refused on
// save. A locked_on box draws ticked, a locked_off box draws clear, and both
// draw disabled. The admin role's row is locked in every cell, so it draws
// wholly disabled and gets no Save button.
//
// The roles themselves are fixed - admin, super, user, guest and shared - so
// the page edits the five rows the server serves and offers no way to add or
// remove one.
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";

const FAMILY_ICONS = {
  admin: "fa-shield-halved",
  media_type: "fa-photo-film",
  field_group: "fa-table-columns",
  label: "fa-tags",
  // The member-only reading surfaces: the four entity kinds, search and the
  // Random Picker. The rows come from the served catalogue.
  view: "fa-eye",
};

export default function Roles() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [roleRows, catalogRows] = await Promise.all([
        fetchJson(endpoints.roles.list()),
        fetchJson(endpoints.roles.catalog()),
      ]);
      setRoles(roleRows);
      setCatalog(catalogRows);
      setSelectedId((current) => current ?? roleRows[0]?.system_id ?? null);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => roles.find((r) => r.system_id === selectedId) ?? null,
    [roles, selectedId],
  );

  // Reset the draft whenever a different role is picked.
  useEffect(() => {
    setDraft(new Set(selected?.permissions ?? []));
  }, [selected]);

  const lockedOn = useMemo(
    () => new Set(selected?.locked_on ?? []),
    [selected],
  );
  const lockedOff = useMemo(
    () => new Set(selected?.locked_off ?? []),
    [selected],
  );

  // A role with nothing left to decide gets no Save button rather than a
  // permanently disabled one.
  const anyEditable = useMemo(
    () =>
      catalog.some((family) =>
        family.permissions.some(
          (p) => !lockedOn.has(p.permission) && !lockedOff.has(p.permission),
        ),
      ),
    [catalog, lockedOn, lockedOff],
  );

  const dirty = useMemo(() => {
    if (!selected) return false;
    const held = new Set(selected.permissions);
    if (held.size !== draft.size) return true;
    for (const p of draft) if (!held.has(p)) return true;
    return false;
  }, [selected, draft]);

  function toggle(permission) {
    if (lockedOn.has(permission) || lockedOff.has(permission)) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetchJson(endpoints.roles.permissions(selected.system_id), {
        method: "PUT",
        ...jsonBody({ permissions: [...draft] }),
      });
      showToast("success", `Saved ${selected.label}.`);
      await load();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading roles...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-user-shield mr-2 text-brand"></i>Roles
        </h1>
        <p className="text-sm text-text-faint mt-1">
          A role is a named bundle of permissions. Everyone who is not logged in
          is <strong>Guest</strong>. Narrow access by removing permissions, not
          by adding them.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        {/* Role list */}
        <aside className="space-y-2">
          {roles.map((role) => (
            <button
              key={role.system_id}
              onClick={() => setSelectedId(role.system_id)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                role.system_id === selectedId
                  ? "border-brand bg-brand-soft font-semibold"
                  : "border-border hover:bg-surface-2"
              }`}
            >
              <div>{role.label}</div>
              <div className="text-[11px] text-text-faint">
                {`${role.permissions.length} permission(s)`}
                {role.user_count > 0 && ` · ${role.user_count} user(s)`}
              </div>
            </button>
          ))}
        </aside>

        {/* Permission grid */}
        <section>
          {!selected ? (
            <p className="text-text-faint text-sm">Pick a role.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-text">
                    {selected.label}
                  </h2>
                  <p className="text-xs text-text-faint">{selected.description}</p>
                </div>
                <div className="flex gap-2">
                  {anyEditable && (
                    <button
                      onClick={save}
                      disabled={!dirty || saving}
                      className="px-4 py-1.5 text-xs font-semibold rounded bg-brand text-on-brand disabled:opacity-40"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {catalog.map((family) => (
                  <div
                    key={family.family}
                    className="border border-border rounded-lg p-4"
                  >
                    <h3 className="text-sm font-bold text-text-muted mb-3">
                      <i
                        className={`fas ${FAMILY_ICONS[family.family] ?? "fa-key"} mr-2 text-text-faint`}
                      ></i>
                      {family.label}
                    </h3>
                    {family.permissions.length === 0 ? (
                      <p className="text-xs text-text-faint italic">
                        None defined yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {family.permissions.map((p) => {
                          const on = lockedOn.has(p.permission);
                          const locked = on || lockedOff.has(p.permission);
                          return (
                          <label
                            key={p.permission}
                            className={`flex items-start gap-2 text-sm ${
                              locked ? "opacity-60" : "cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={on || draft.has(p.permission)}
                              disabled={locked}
                              onChange={() => toggle(p.permission)}
                            />
                            <span>
                              <span className="font-medium">{p.label}</span>
                              {p.description && (
                                <span className="block text-[11px] text-text-faint">
                                  {p.description}
                                </span>
                              )}
                            </span>
                          </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
