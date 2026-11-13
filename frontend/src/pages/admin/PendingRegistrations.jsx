// Frontend: the Pending registrations panel on /system.
//
// An invite link (issued on /users) lets one person register an account,
// which arrives `pending` and can do nothing until the admin answers here:
// Approve makes it active with the role and modes chosen on its row, Decline
// deletes it. Both are admin.authz on the server, so the panel is drawn - and
// asks for anything - only for a session holding it; /system itself is
// gated on manage.pipelines, which super holds too.
//
// The form offers exactly what the server takes: role user or super (default
// user), ceiling and default from safe / normal / borderline (default normal
// / normal). Unrestricted is never offered - it is granted later on /users,
// per person. The default select offers nothing above the ceiling.
import { useState } from "react";

import {
  useApproveRegistration,
  useDeclineRegistration,
  usePendingRegistrations,
} from "../../api/mutations/useRegistrationMutations";
import { endpoints } from "../../api/endpoints";
import ConfirmModal from "../../components/modals/ConfirmModal";
import { useAuth } from "../../contexts/AuthContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast } from "../../hooks/useToast";

const ROLE_CHOICES = [
  { name: "user", label: "User" },
  { name: "super", label: "Super" },
];

// Narrowest first: the default may not sit above the ceiling.
const MODE_CHOICES = [
  { key: "safe", label: "Safe" },
  { key: "normal", label: "Normal" },
  { key: "borderline", label: "Borderline" },
];
const rankOf = (key) => MODE_CHOICES.findIndex((m) => m.key === key);

const SELECT_CLS =
  "bg-surface-2 border border-border-strong rounded-lg text-sm font-bold focus:ring-brand focus:border-brand py-1.5 px-2";

export default function PendingRegistrations() {
  const { has } = useAuth();
  const canApprove = has("admin.authz");
  const pending = usePendingRegistrations({ enabled: canApprove });
  // The role select names user/super; the server takes the role's id.
  const roles = useApiQuery(["roles"], endpoints.roles.list(), { enabled: canApprove });

  if (!canApprove) return null;

  const rows = pending.data ?? [];

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      <h2 className="text-lg font-black text-text uppercase tracking-widest mb-4 flex items-center border-b border-border pb-2">
        Pending Registrations
      </h2>
      {pending.isLoading ? (
        <p className="text-sm text-text-faint">
          <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>
          Loading…
        </p>
      ) : pending.isError ? (
        <p role="alert" className="text-sm text-danger">
          {pending.error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 px-4 bg-surface-2 rounded-xl border border-border border-dashed">
          <p className="text-text-faint font-medium italic text-sm">
            No pending registrations
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((user) => (
            <PendingRow key={user.id} user={user} roles={roles.data ?? []} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingRow({ user, roles }) {
  const { showToast } = useToast();
  const approve = useApproveRegistration();
  const decline = useDeclineRegistration();
  const [roleName, setRoleName] = useState("user");
  const [ceiling, setCeiling] = useState("normal");
  const [defaultMode, setDefaultMode] = useState("normal");
  const [confirming, setConfirming] = useState(false);
  const busy = approve.isPending || decline.isPending;

  function changeCeiling(key) {
    setCeiling(key);
    if (rankOf(defaultMode) > rankOf(key)) setDefaultMode(key);
  }

  function handleApprove() {
    const roleId = roles.find((r) => r.name === roleName)?.system_id;
    const data = { ceiling_mode: ceiling, default_mode: defaultMode };
    // Left out, the server approves as user; a chosen role needs its id.
    if (roleId) data.role_id = roleId;
    else if (roleName !== "user") {
      showToast("error", "The roles have not loaded yet; try again.");
      return;
    }
    approve.mutate(
      { id: user.id, data },
      {
        onSuccess: () => showToast("success", `Approved ${user.username}.`),
        onError: (err) => showToast("error", err.message),
      },
    );
  }

  function handleDecline() {
    decline.mutate(user.id, {
      onSuccess: () => {
        setConfirming(false);
        showToast("success", `Declined ${user.username}.`);
      },
      onError: (err) => {
        setConfirming(false);
        showToast("error", err.message);
      },
    });
  }

  const id = `pending-${user.id}`;
  return (
    <li className="py-3 flex flex-wrap items-end gap-3">
      <span className="font-mono text-sm text-text min-w-[8rem] self-center">
        {user.username}
      </span>
      <label htmlFor={`${id}-role`} className="flex flex-col gap-1 text-[10px] font-bold text-text-faint uppercase tracking-wider">
        Role
        <select
          id={`${id}-role`}
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          className={SELECT_CLS}
        >
          {ROLE_CHOICES.map((r) => (
            <option key={r.name} value={r.name}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-ceiling`} className="flex flex-col gap-1 text-[10px] font-bold text-text-faint uppercase tracking-wider">
        Ceiling
        <select
          id={`${id}-ceiling`}
          value={ceiling}
          onChange={(e) => changeCeiling(e.target.value)}
          className={SELECT_CLS}
        >
          {MODE_CHOICES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-default`} className="flex flex-col gap-1 text-[10px] font-bold text-text-faint uppercase tracking-wider">
        Default
        <select
          id={`${id}-default`}
          value={defaultMode}
          onChange={(e) => setDefaultMode(e.target.value)}
          className={SELECT_CLS}
        >
          {MODE_CHOICES.filter((m) => rankOf(m.key) <= rankOf(ceiling)).map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 ml-auto">
        <button
          type="button"
          onClick={handleApprove}
          disabled={busy}
          className="bg-brand hover:bg-brand-hover text-on-brand rounded-lg px-4 py-2 text-sm font-bold transition disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="bg-surface border border-border-strong rounded-lg px-4 py-2 text-sm font-bold text-danger hover:border-danger transition disabled:opacity-60"
        >
          Decline
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          title={`Decline ${user.username}?`}
          confirmLabel="Decline"
          danger
          busy={decline.isPending}
          onConfirm={handleDecline}
          onCancel={() => setConfirming(false)}
        >
          This deletes the account {user.username} registered. The invite link
          it used stays spent; to let them try again, issue a new one on Users.
        </ConfirmModal>
      )}
    </li>
  );
}
