// Frontend: accounts and the role each one holds.
//
// There is no self-registration: accounts are created here. The server refuses
// to let you delete yourself or demote the last account that can still
// administer the site, and those refusals surface as toasts rather than being
// pre-empted here - one rule, enforced in one place.
//
// The lifecycle controls are offered only where the server would take them,
// because a button that can only ever earn a 409 is noise: Disable on an
// active account other than your own, Enable on a disabled one, neither on a
// pending one (that is approved or declined, not edited), and a reset link on
// an active account whose role is not `shared` (the admin sets a shared
// account's password here instead). The server still refuses each of them.
//
// The same reasoning shapes the role and mode controls. An account is created
// in, or moved to, only `user` or `super`; an admin or shared account keeps
// its role, so its row shows the role as text. A shared account cannot be
// deleted (disable it instead) and its access mode is fixed, so its row shows
// the mode and offers no panel to change it.
import { useCallback, useEffect, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import ConfirmModal from "../../components/modals/ConfirmModal";
import OnceLinkModal from "../../components/modals/OnceLinkModal";
import { Chip } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";

const BLANK = { username: "", password: "", role_id: "" };

// Disabled is the one state that is a refusal, so it alone takes danger.
const STATUS_TONE = { active: "ink", disabled: "danger", pending: "muted" };

// Roles whose open-request limit is fixed at "none" (UNLIMITED_ROLES in
// app/services/domain/requests.py): the server answers 422 to a limit on one.
const UNLIMITED_ROLE_NAMES = new Set(["super"]);

// Whether an account in `role` has a limit to set. Not for super, which is
// never limited, and not for the root role, which files nothing.
function hasRequestLimit(role) {
  return Boolean(role) && !role.is_root && !UNLIMITED_ROLE_NAMES.has(role.name);
}

// The only roles an account can be created in or moved to. The other three
// are fixed: guest holds no account, and an admin or shared account keeps the
// role it has - the server answers 422 to anything else, and 409 to changing
// an admin's or shared account's role.
const ASSIGNABLE_ROLE_NAMES = new Set(["user", "super"]);

// Roles whose accounts keep the role they have, so the row shows it as text.
const FIXED_ROLE_NAMES = new Set(["admin", "shared"]);

// The account's role key. role_name comes on the response; the lookup by id
// covers a row served without it.
function assignable(roles) {
  return roles.filter((r) => ASSIGNABLE_ROLE_NAMES.has(r.name));
}

function roleNameOf(user, roles) {
  return (
    user.role_name ?? roles.find((r) => r.system_id === user.role_id)?.name ?? null
  );
}

// The limit field's text as the API's value: blank is no limit (null).
function limitValue(text) {
  return text.trim() === "" ? null : Number(text);
}

export default function Users() {
  const { showToast } = useToast();
  const { username: myUsername } = useAuth();
  const [disabling, setDisabling] = useState(null);
  const [busy, setBusy] = useState(false);
  // {user, link, expires_at} for the reset link just minted - held only
  // while its modal is open, since the server never shows it again.
  const [resetLink, setResetLink] = useState(null);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    role_id: "",
    password: "",
    open_request_limit: "",
  });
  const [modes, setModes] = useState([]);
  const [modesFor, setModesFor] = useState(null);
  const assignableRoles = assignable(roles);

  async function saveAccessModes(user, next) {
    try {
      await fetchJson(endpoints.users.accessModes(user.id), {
        method: "PUT",
        ...jsonBody(next),
      });
      showToast("success", `Updated ${user.username}'s access.`);
      setModesFor(null);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  const load = useCallback(async () => {
    try {
      const [userRows, roleRows, modeRows] = await Promise.all([
        fetchJson(endpoints.users.list()),
        fetchJson(endpoints.roles.list()),
        fetchJson(endpoints.accessModes.list()),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
      setModes(modeRows);
      setDraft((d) => ({
        ...d,
        role_id: d.role_id || assignable(roleRows)[0]?.system_id || "",
      }));
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    try {
      await fetchJson(endpoints.users.create(), {
        method: "POST",
        ...jsonBody(draft),
      });
      showToast("success", `Created ${draft.username}.`);
      setDraft({ ...BLANK, role_id: assignableRoles[0]?.system_id ?? "" });
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function saveEdit(user) {
    const payload = {};
    if (editDraft.role_id && editDraft.role_id !== user.role_id)
      payload.role_id = editDraft.role_id;
    if (editDraft.password) payload.password = editDraft.password;
    // Sent only when it changed: left out, a role change resets the limit to
    // the new role's default on the server.
    const editedRole = roles.find((r) => r.system_id === editDraft.role_id);
    if (hasRequestLimit(editedRole)) {
      const limit = limitValue(editDraft.open_request_limit);
      if (limit !== (user.open_request_limit ?? null))
        payload.open_request_limit = limit;
    }
    if (Object.keys(payload).length === 0) {
      setEditingId(null);
      return;
    }
    try {
      await fetchJson(endpoints.users.update(user.id), {
        method: "PATCH",
        ...jsonBody(payload),
      });
      showToast("success", `Updated ${user.username}.`);
      setEditingId(null);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function setStatus(user, status) {
    setBusy(true);
    try {
      await fetchJson(endpoints.users.update(user.id), {
        method: "PATCH",
        ...jsonBody({ status }),
      });
      showToast(
        "success",
        status === "disabled" ? `Disabled ${user.username}.` : `Enabled ${user.username}.`,
      );
      setDisabling(null);
      await load();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function makeResetLink(user) {
    try {
      const data = await fetchJson(endpoints.users.resetLink(user.id), {
        method: "POST",
      });
      setResetLink({ user, link: data.link, expires_at: data.expires_at });
    } catch (err) {
      showToast("error", err.message);
    }
  }

  async function remove(user) {
    try {
      await fetchJson(endpoints.users.remove(user.id), { method: "DELETE" });
      showToast("success", `Deleted ${user.username}.`);
      await load();
    } catch (err) {
      showToast("error", err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-text-faint">
        <i className="fas fa-spinner fa-spin mr-2"></i>Loading users...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">
          <i className="fas fa-users mr-2 text-brand"></i>Users
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Accounts you create by hand. Anyone without one browses as Guest.
        </p>
      </header>

      <form
        onSubmit={create}
        className="border border-border rounded-lg p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <label className="text-xs font-semibold text-text-muted">
          Username
          <input
            required
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-text-muted">
          Password
          <input
            required
            type="password"
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-text-muted">
          Role
          <select
            value={draft.role_id}
            onChange={(e) => setDraft({ ...draft, role_id: e.target.value })}
            className="mt-1 w-full border rounded px-2 py-1.5 text-sm font-normal"
          >
            {assignableRoles.map((role) => (
              <option key={role.system_id} value={role.system_id}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand text-on-brand rounded px-4 py-2 text-sm font-semibold"
        >
          Add user
        </button>
      </form>

      <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
        <thead className="bg-surface-2 text-xs uppercase text-text-faint">
          <tr>
            <th className="text-left px-4 py-2">Username</th>
            <th className="text-left px-4 py-2">Role</th>
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-left px-4 py-2">Access</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const roleName = roleNameOf(user, roles);
            const isShared = roleName === "shared";
            return (
            <tr key={user.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{user.username}</td>
              <td className="px-4 py-2">
                {editingId === user.id ? (
                  <div className="flex flex-col gap-2">
                    {FIXED_ROLE_NAMES.has(roleName) ? (
                      <span className="text-text-muted">{roleName}</span>
                    ) : (
                      <select
                        aria-label="Role"
                        value={editDraft.role_id}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, role_id: e.target.value })
                        }
                        className="border rounded px-2 py-1 text-xs"
                      >
                        {assignableRoles.map((role) => (
                          <option key={role.system_id} value={role.system_id}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="password"
                      placeholder="New password (optional)"
                      aria-describedby={`password-help-${user.id}`}
                      value={editDraft.password}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, password: e.target.value })
                      }
                      className="border rounded px-2 py-1 text-xs"
                    />
                    <span
                      id={`password-help-${user.id}`}
                      className="text-[11px] text-text-faint"
                    >
                      Setting a password signs this account out everywhere.
                    </span>
                    {hasRequestLimit(
                      roles.find((r) => r.system_id === editDraft.role_id),
                    ) && (
                      <label className="text-[11px] text-text-faint">
                        Open request limit
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="No limit"
                          value={editDraft.open_request_limit}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              open_request_limit: e.target.value,
                            })
                          }
                          className="mt-0.5 block w-full border rounded px-2 py-1 text-xs"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <span className="text-text-muted">{user.role_name}</span>
                )}
              </td>
              <td className="px-4 py-2">
                <Chip tone={STATUS_TONE[user.status] ?? "ink"}>{user.status}</Chip>
              </td>
              <td className="px-4 py-2 text-xs text-text-faint">
                {isShared ? (
                  // A shared account's mode is the account itself: ceiling and
                  // default are both its own mode, and the server answers 409
                  // to changing them, so there is nothing here to edit.
                  `Mode: ${
                    modes.find((m) => m.key === user.mode_ceiling)?.label ??
                    user.mode_ceiling
                  } (fixed)`
                ) : (
                  <>
                {user.mode_ceiling == null ? (
                  <span className="text-danger">no mode — sees nothing</span>
                ) : (
                  `${user.mode_ceiling} / ${user.mode_default}` +
                  (user.denied_label_keys.length +
                    user.denied_field_group_keys.length >
                  0
                    ? " (narrowed)"
                    : "")
                )}
                <button
                  onClick={() => setModesFor(user.id)}
                  className="ml-2 text-brand"
                >
                  Change
                </button>
                  </>
                )}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {editingId === user.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(user)}
                      className="text-brand font-semibold text-xs mr-3"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-text-faint text-xs"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(user.id);
                        setEditDraft({
                          role_id: user.role_id ?? assignableRoles[0]?.system_id ?? "",
                          password: "",
                          open_request_limit:
                            user.open_request_limit == null
                              ? ""
                              : String(user.open_request_limit),
                        });
                      }}
                      className="text-brand text-xs mr-3"
                    >
                      Edit
                    </button>
                    {user.status === "active" && user.role_name !== "shared" && (
                      <button
                        onClick={() => makeResetLink(user)}
                        className="text-brand text-xs mr-3"
                      >
                        Reset link
                      </button>
                    )}
                    {user.status === "active" && user.username !== myUsername && (
                      <button
                        onClick={() => setDisabling(user)}
                        className="text-danger text-xs mr-3"
                      >
                        Disable
                      </button>
                    )}
                    {user.status === "disabled" && (
                      <button
                        onClick={() => setStatus(user, "active")}
                        disabled={busy}
                        className="text-brand text-xs mr-3"
                      >
                        Enable
                      </button>
                    )}
                    {!isShared && (
                      <button
                        onClick={() => remove(user)}
                        className="text-danger text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      {/*
        Keyed by the account so switching straight from one user's panel to
        another remounts it: the panel's state is seeded in useState
        initializers, which run once per mount and would otherwise keep the
        first account's ceiling and denials under the second account's name.
      */}
      {modesFor !== null && (
        <AccessModePanel
          key={modesFor}
          user={users.find((u) => u.id === modesFor)}
          modes={modes}
          onClose={() => setModesFor(null)}
          onSave={saveAccessModes}
        />
      )}

      {disabling && (
        <ConfirmModal
          title={`Disable ${disabling.username}?`}
          confirmLabel="Disable"
          danger
          busy={busy}
          onConfirm={() => setStatus(disabling, "disabled")}
          onCancel={() => setDisabling(null)}
        >
          This signs {disabling.username} out everywhere, on every device, and
          the account cannot sign in until you enable it again. Nothing in it
          is lost.
        </ConfirmModal>
      )}

      {resetLink && (
        <OnceLinkModal
          title={`Reset link for ${resetLink.user.username}`}
          link={resetLink.link}
          expiresAt={resetLink.expires_at}
          onClose={() => setResetLink(null)}
        >
          <p>
            Give this to {resetLink.user.username} outside the site. It works
            once, shows them their username, and lets them set a new password;
            using it signs the account out everywhere. Making a new link stops
            this one working.
          </p>
        </OnceLinkModal>
      )}
    </div>
  );
}

/**
 * One account's ceiling, login default, and what it is denied.
 *
 * The ceiling is the widest mode the account may switch to; the default is
 * where a login lands, and can only be at or below the ceiling, so the
 * default select offers nothing above it. The order is each mode's `rank`
 * from GET /api/access-modes - the SPA keeps no copy of it.
 *
 * The denial toggles are THE CEILING'S OWN LIST with tick-to-deny, and that
 * is the whole point rather than a layout choice. Denials only subtract, and
 * apply in every mode the account uses, so showing what the ceiling shows
 * and letting you remove from it makes the control structurally incapable of
 * expressing something outside it. The server refuses a stray denial with
 * 422; this is why nobody ever sees that error.
 */
function AccessModePanel({ user, modes, onClose, onSave }) {
  const ranked = modes
    .filter((m) => m.rank != null)
    .sort((a, b) => a.rank - b.rank);
  const byKey = Object.fromEntries(ranked.map((m) => [m.key, m]));

  const [ceiling, setCeiling] = useState(user?.mode_ceiling ?? null);
  const [defaultKey, setDefaultKey] = useState(user?.mode_default ?? null);
  const [deniedLabels, setDeniedLabels] = useState(
    () => user?.denied_label_keys ?? [],
  );
  const [deniedGroups, setDeniedGroups] = useState(
    () => user?.denied_field_group_keys ?? [],
  );

  if (!user) return null;

  const ceilingMode = ceiling ? byKey[ceiling] : null;
  const shownLabels = ceilingMode?.label_keys ?? [];
  const shownGroups = ceilingMode?.field_group_keys ?? [];
  const defaultOptions = ceilingMode
    ? ranked.filter((m) => m.rank <= ceilingMode.rank)
    : [];

  function changeCeiling(key) {
    const next = key === "" ? null : byKey[key];
    setCeiling(next ? next.key : null);
    if (!next) {
      setDefaultKey(null);
    } else if (!defaultKey || byKey[defaultKey]?.rank > next.rank) {
      setDefaultKey(next.key);
    }
    // A denial of something the new ceiling does not show subtracts nothing.
    setDeniedLabels((d) => d.filter((k) => next?.label_keys.includes(k)));
    setDeniedGroups((d) => d.filter((k) => next?.field_group_keys.includes(k)));
  }

  function toggle(setter, key) {
    setter((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
  }

  function save() {
    onSave(user, {
      ceiling,
      default: ceiling ? defaultKey : null,
      denied_label_keys: deniedLabels,
      denied_field_group_keys: deniedGroups,
    });
  }

  return (
    <div className="mt-6 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">
          Access for {user.username}
        </h2>
        <div className="flex gap-3">
          <button onClick={save} className="text-brand text-xs font-semibold">
            Save
          </button>
          <button onClick={onClose} className="text-text-faint text-xs">
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-text-muted mb-3">
        <label className="flex flex-col gap-1">
          Widest mode (ceiling)
          <select
            value={ceiling ?? ""}
            onChange={(e) => changeCeiling(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">No mode</option>
            {ranked.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        {ceilingMode && (
          <label className="flex flex-col gap-1">
            Lands here at login (default)
            <select
              value={defaultKey ?? ""}
              onChange={(e) => setDefaultKey(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            >
              {defaultOptions.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!ceilingMode ? (
        <p className="text-xs text-danger">
          This account has no access mode, so it can reach nothing. That is
          fail-closed rather than broken, but it is almost certainly not what
          you meant.
        </p>
      ) : shownLabels.length + shownGroups.length === 0 ? (
        <p className="text-[11px] text-text-faint">
          This ceiling shows nothing to narrow.
        </p>
      ) : (
        <div className="text-[11px] text-text-faint">
          <span>Untick to withhold from this account, in every mode:</span>
          <div className="flex flex-wrap gap-3 mt-1">
            {shownLabels.map((key) => (
              <label
                key={`l-${key}`}
                className="flex items-center gap-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!deniedLabels.includes(key)}
                  onChange={() => toggle(setDeniedLabels, key)}
                />
                {key}
              </label>
            ))}
            {shownGroups.map((key) => (
              <label
                key={`f-${key}`}
                className="flex items-center gap-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!deniedGroups.includes(key)}
                  onChange={() => toggle(setDeniedGroups, key)}
                />
                {key}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
