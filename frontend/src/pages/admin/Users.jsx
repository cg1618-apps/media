// Frontend: accounts and the role each one holds.
//
// Accounts are created here, or arrive through an invite link issued here and
// wait as `pending` for approval on /system (its Pending registrations panel),
// so this table does not list them. The server refuses to let you delete or
// disable yourself, and those refusals surface as toasts rather than being
// pre-empted here - one rule, enforced in one place.
//
// The lifecycle controls are offered only where the server would take them,
// because a button that can only ever earn a 409 is noise: Disable on an
// active account other than your own, Enable on a disabled one, and a reset
// link on an active account whose role is not `shared` (the admin sets a
// shared account's password here instead). The server still refuses each of
// them.
//
// The same reasoning shapes the role and mode controls. An account is created
// in, or moved to, only `user` or `super`; an admin or shared account keeps
// its role, so the edit dialog shows the role as text. Neither can be deleted
// (the server answers 409). The admin account has no mode at all - it reads
// no catalogue - and the server answers 409 to giving it one, so its row says
// so and its edit dialog offers no mode controls. Every other account,
// shared ones included, has a ceiling and default the dialog edits.
//
// The feature switches (quotes and memes, favourites, music status, mod
// status) are per account, and only a `user` or `super` account holds them:
// the server answers 409 to switching one on anywhere else, so an admin or
// shared account is offered none.
//
// The table's Access column is a read-only summary - mode and the switches
// that are on. Everything in it is edited from the row's Edit dialog, which
// saves the account fields and switches as one PATCH and the mode as one PUT,
// each sent only when something in it changed.
import { useCallback, useEffect, useId, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import ConfirmModal from "../../components/modals/ConfirmModal";
import OnceLinkModal from "../../components/modals/OnceLinkModal";
import { Button, Chip } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";

const BLANK = { username: "", password: "", role_id: "" };

// Disabled is the one state that is a refusal, so it alone takes danger.
const STATUS_TONE = { active: "ink", disabled: "danger", pending: "muted" };

// Roles whose open-request limit is fixed at "none" (UNLIMITED_ROLES in
// app/services/domain/requests.py): the server answers 422 to a limit on one.
const UNLIMITED_ROLE_NAMES = new Set(["super"]);

// Whether an account in `role` has a limit to set. Not for super, which is
// never limited, and not for admin, which files nothing (it holds no
// self.requests).
function hasRequestLimit(role) {
  return (
    Boolean(role) && role.name !== "admin" && !UNLIMITED_ROLE_NAMES.has(role.name)
  );
}

// The only roles an account can be created in or moved to. The other three
// are fixed: guest holds no account, and an admin or shared account keeps the
// role it has - the server answers 422 to anything else, and 409 to changing
// an admin's or shared account's role.
const ASSIGNABLE_ROLE_NAMES = new Set(["user", "super"]);

// Roles whose accounts keep the role they have, so the row shows it as text.
const FIXED_ROLE_NAMES = new Set(["admin", "shared"]);

// The per-account feature switches, in the order the page shows them. Each is
// a boolean `feature_<name>` field on the user response and the PATCH body.
const FEATURES = [
  { field: "feature_quotes_memes", label: "Quotes & memes" },
  { field: "feature_favourites", label: "Favourites" },
  { field: "feature_music_status", label: "Music status" },
  { field: "feature_mod_status", label: "Mod status" },
];

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
  // {link, expires_at} for the invite link just minted, on the same terms.
  const [invite, setInvite] = useState(null);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [modes, setModes] = useState([]);
  const assignableRoles = assignable(roles);

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

  // The dialog's save: the account fields and switches as one PATCH, the
  // mode as one PUT, each null when nothing in it changed.
  async function saveEdit(user, { patch, access }) {
    if (!patch && !access) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      if (patch) {
        await fetchJson(endpoints.users.update(user.id), {
          method: "PATCH",
          ...jsonBody(patch),
        });
      }
      if (access) {
        await fetchJson(endpoints.users.accessModes(user.id), {
          method: "PUT",
          ...jsonBody(access),
        });
      }
      showToast("success", `Updated ${user.username}.`);
      setEditingId(null);
      await load();
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setBusy(false);
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

  async function makeInvite() {
    try {
      const data = await fetchJson(endpoints.users.invites(), { method: "POST" });
      setInvite({ link: data.link, expires_at: data.expires_at });
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
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">
            <i className="fas fa-users mr-2 text-brand"></i>Users
          </h1>
          <p className="text-sm text-text-faint mt-1">
            Accounts you create by hand or invite someone to register. Anyone
            without one browses as Guest.
          </p>
        </div>
        <button
          type="button"
          onClick={makeInvite}
          className="border border-brand text-brand rounded px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          Invite link
        </button>
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
          {users
            .filter((user) => user.status !== "pending")
            .map((user) => {
            const roleName = roleNameOf(user, roles);
            const isShared = roleName === "shared";
            const isAdminAccount = roleName === "admin";
            return (
            <tr key={user.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{user.username}</td>
              <td className="px-4 py-2">
                <span className="text-text-muted">{user.role_name}</span>
              </td>
              <td className="px-4 py-2">
                <Chip tone={STATUS_TONE[user.status] ?? "ink"}>{user.status}</Chip>
              </td>
              <td className="px-4 py-2 text-xs text-text-faint">
                <AccessSummary user={user} roleName={roleName} />
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => setEditingId(user.id)}
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
                {!isShared && !isAdminAccount && (
                  <button
                    onClick={() => remove(user)}
                    className="text-danger text-xs"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>

      {/*
        Keyed by the account so opening another account's dialog remounts it:
        the dialog's state is seeded in useState initializers, which run once
        per mount and would otherwise keep the first account's values under
        the second account's name.
      */}
      {editingId !== null && users.some((u) => u.id === editingId) && (
        <UserEditDialog
          key={editingId}
          user={users.find((u) => u.id === editingId)}
          roles={roles}
          modes={modes}
          busy={busy}
          onCancel={() => setEditingId(null)}
          onSave={saveEdit}
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

      {invite && (
        <OnceLinkModal
          title="Invite link"
          link={invite.link}
          expiresAt={invite.expires_at}
          onClose={() => setInvite(null)}
        >
          <p>
            Give this to the person you are inviting, outside the site. It
            works once and lets them register one account, which waits for
            your approval under Pending registrations on the System page.
            Making another link does not stop this one working.
          </p>
        </OnceLinkModal>
      )}
    </div>
  );
}


/**
 * The Access column: what the account's mode is and which switches are on,
 * as text. Nothing here is a control - the row's Edit dialog changes all of
 * it.
 */
function AccessSummary({ user, roleName }) {
  const on = FEATURES.filter(({ field }) => user[field]);
  return (
    <>
      {roleName === "admin" ? (
        // The admin reads no catalogue, so it has no mode: the server answers
        // 409 to a ceiling on this account.
        "No mode (admin)"
      ) : user.mode_ceiling == null ? (
        <span className="text-danger">no mode — sees nothing</span>
      ) : (
        `${user.mode_ceiling} / ${user.mode_default}` +
        ((user.denied_label_keys?.length ?? 0) +
          (user.denied_field_group_keys?.length ?? 0) >
        0
          ? " (narrowed)"
          : "")
      )}
      {ASSIGNABLE_ROLE_NAMES.has(roleName) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {on.length === 0 ? (
            <span>No features on</span>
          ) : (
            on.map(({ field, label }) => <Chip key={field}>{label}</Chip>)
          )}
        </div>
      )}
    </>
  );
}

// Two key lists as the same set, whatever their order.
function sameKeys(a, b) {
  return [...a].sort().join("\n") === [...b].sort().join("\n");
}

/**
 * One account's Edit dialog: role, password, open request limit, the feature
 * switches, and the access mode. Save sends the changed account fields and
 * switches as one PATCH /api/users/{id} and a changed mode as one
 * PUT /api/users/{id}/access-modes; a save that changed nothing closes the
 * dialog and sends nothing. Escape cancels, as Cancel does.
 */
function UserEditDialog({ user, roles, modes, busy, onCancel, onSave }) {
  const titleId = useId();
  const passwordHelpId = useId();
  const roleName = roleNameOf(user, roles);
  const roleFixed = FIXED_ROLE_NAMES.has(roleName);
  const holdsFeatures = ASSIGNABLE_ROLE_NAMES.has(roleName);
  const hasMode = roleName !== "admin";
  const assignableRoles = assignable(roles);

  const [roleId, setRoleId] = useState(
    user.role_id ?? assignableRoles[0]?.system_id ?? "",
  );
  const [password, setPassword] = useState("");
  const [limitText, setLimitText] = useState(
    user.open_request_limit == null ? "" : String(user.open_request_limit),
  );
  const [features, setFeatures] = useState(() =>
    Object.fromEntries(FEATURES.map(({ field }) => [field, Boolean(user[field])])),
  );
  const [access, setAccess] = useState(() => ({
    ceiling: user.mode_ceiling ?? null,
    default: user.mode_default ?? null,
    denied_label_keys: user.denied_label_keys ?? [],
    denied_field_group_keys: user.denied_field_group_keys ?? [],
  }));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const editedRole = roles.find((r) => r.system_id === roleId);

  function save() {
    const patch = {};
    if (!roleFixed && roleId && roleId !== user.role_id) patch.role_id = roleId;
    if (password) patch.password = password;
    // Sent only when it changed: left out, a role change resets the limit to
    // the new role's default on the server.
    if (hasRequestLimit(editedRole)) {
      const limit = limitValue(limitText);
      if (limit !== (user.open_request_limit ?? null))
        patch.open_request_limit = limit;
    }
    if (holdsFeatures) {
      for (const { field } of FEATURES) {
        if (features[field] !== Boolean(user[field])) patch[field] = features[field];
      }
    }

    const nextAccess = {
      ...access,
      default: access.ceiling ? access.default : null,
    };
    const accessChanged =
      hasMode &&
      (nextAccess.ceiling !== (user.mode_ceiling ?? null) ||
        nextAccess.default !== (user.mode_default ?? null) ||
        !sameKeys(nextAccess.denied_label_keys, user.denied_label_keys ?? []) ||
        !sameKeys(
          nextAccess.denied_field_group_keys,
          user.denied_field_group_keys ?? [],
        ));

    onSave(user, {
      patch: Object.keys(patch).length > 0 ? patch : null,
      access: accessChanged ? nextAccess : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface border border-border shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3
            id={titleId}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
          >
            Edit {user.username}
          </h3>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5 text-xs text-text-muted">
          <section className="flex flex-col gap-2">
            {roleFixed ? (
              <span>
                Role: <span className="text-text">{roleName}</span>
              </span>
            ) : (
              <label className="flex flex-col gap-1">
                Role
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  {assignableRoles.map((role) => (
                    <option key={role.system_id} value={role.system_id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              type="password"
              placeholder="New password (optional)"
              aria-describedby={passwordHelpId}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
            <span id={passwordHelpId} className="text-[11px] text-text-faint">
              Setting a password signs this account out everywhere.
            </span>
            {hasRequestLimit(editedRole) && (
              <label className="text-[11px] text-text-faint">
                Open request limit
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="No limit"
                  value={limitText}
                  onChange={(e) => setLimitText(e.target.value)}
                  className="mt-0.5 block w-full border rounded px-2 py-1 text-xs"
                />
              </label>
            )}
          </section>

          {holdsFeatures && (
            <fieldset className="flex flex-col gap-1">
              <legend className="font-semibold text-text mb-1">Features</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {FEATURES.map(({ field, label }) => (
                  <label key={field} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={features[field]}
                      onChange={() =>
                        setFeatures((f) => ({ ...f, [field]: !f[field] }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {hasMode ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="font-semibold text-text mb-1">Access mode</legend>
              <AccessModeFields modes={modes} value={access} onChange={setAccess} />
            </fieldset>
          ) : (
            <p className="text-[11px] text-text-faint">
              The admin account has no access mode: it reads no catalogue.
            </p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button kind="primary" onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      </div>
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
function AccessModeFields({ modes, value, onChange }) {
  const ranked = modes
    .filter((m) => m.rank != null)
    .sort((a, b) => a.rank - b.rank);
  const byKey = Object.fromEntries(ranked.map((m) => [m.key, m]));

  const {
    ceiling,
    default: defaultKey,
    denied_label_keys: deniedLabels,
    denied_field_group_keys: deniedGroups,
  } = value;
  const ceilingMode = ceiling ? byKey[ceiling] : null;
  const shownLabels = ceilingMode?.label_keys ?? [];
  const shownGroups = ceilingMode?.field_group_keys ?? [];
  const defaultOptions = ceilingMode
    ? ranked.filter((m) => m.rank <= ceilingMode.rank)
    : [];

  function changeCeiling(key) {
    const next = key === "" ? null : byKey[key];
    let nextDefault = defaultKey;
    if (!next) {
      nextDefault = null;
    } else if (!defaultKey || byKey[defaultKey]?.rank > next.rank) {
      nextDefault = next.key;
    }
    onChange({
      ceiling: next ? next.key : null,
      default: nextDefault,
      // A denial of something the new ceiling does not show subtracts nothing.
      denied_label_keys: deniedLabels.filter((k) => next?.label_keys.includes(k)),
      denied_field_group_keys: deniedGroups.filter((k) =>
        next?.field_group_keys.includes(k),
      ),
    });
  }

  function toggle(field, key) {
    const list = value[field];
    onChange({
      ...value,
      [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-4 mb-2">
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
              onChange={(e) => onChange({ ...value, default: e.target.value })}
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
                  onChange={() => toggle("denied_label_keys", key)}
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
                  onChange={() => toggle("denied_field_group_keys", key)}
                />
                {key}
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
