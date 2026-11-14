// Frontend: the account's own settings page. It says which account the
// session is and the role it holds, and - for an account holding
// self.password - offers changing the password. Nothing about an account's
// data is shareable, so there is no visibility switch to offer.
import { useCallback, useEffect, useState } from "react";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { Button, Eyebrow, Slip } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { newPasswordProblem } from "../../lib/newPassword";

const INPUT_CLS =
  "w-full px-3 py-2 border border-border-strong bg-surface text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition";

const BLANK_PASSWORDS = { current: "", next: "", again: "" };

export default function Settings() {
  const { showToast } = useToast();
  const { has } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchJson(endpoints.account.settings()));
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
    return <div className="p-8 text-center text-text-faint">Loading settings...</div>;
  }

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-text-muted">
        Sign in to see your settings.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <Eyebrow className="mt-1">Account</Eyebrow>
      </header>

      <Slip title="Account">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-text-muted">Username</dt>
          <dd className="font-mono text-text">{settings.username}</dd>
          <dt className="text-text-muted">Role</dt>
          <dd className="text-text">{settings.role_name}</dd>
        </dl>
        <p className="mt-4 text-sm text-text-muted">
          Your list, ratings and personal notes are visible to your account only.
        </p>
      </Slip>

      {/* self.password, not "signed in": a shared account has no password
          of its own to change, and the admin, whose role holds no self.*
          key, sets its own on /users. */}
      {has("self.password") && <PasswordCard />}
    </div>
  );
}

/**
 * Changing your own password. It does NOT end your other sessions - a reset
 * link does that - so the page says you stay signed in. The two checks the
 * server has (empty, past 72 bytes) are repeated here only to answer before
 * a round trip; the server's refusal is shown as it comes.
 */
function PasswordCard() {
  const { showToast } = useToast();
  const [fields, setFields] = useState(BLANK_PASSWORDS);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState(false);

  function set(name) {
    return (e) => setFields((f) => ({ ...f, [name]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setDone("");
    const problem = newPasswordProblem(fields.next, fields.again);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await fetchJson(endpoints.account.password(), {
        method: "PUT",
        ...jsonBody({
          current_password: fields.current,
          new_password: fields.next,
        }),
      });
      setFields(BLANK_PASSWORDS);
      setDone("Password changed. You stay signed in, here and on your other devices.");
      showToast("success", "Password changed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Slip title="Password" className="mt-6">
      <form onSubmit={save} className="space-y-4">
        {error && (
          <div role="alert" className="border border-danger text-danger px-3 py-2 text-sm">
            {error}
          </div>
        )}
        {done && (
          <p role="status" className="text-sm text-text-muted">
            {done}
          </p>
        )}
        <div>
          <Eyebrow as="label" htmlFor="settings-current-password" className="block mb-1.5">
            Current password
          </Eyebrow>
          <input
            id="settings-current-password"
            type="password"
            autoComplete="current-password"
            value={fields.current}
            onChange={set("current")}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <Eyebrow as="label" htmlFor="settings-new-password" className="block mb-1.5">
            New password
          </Eyebrow>
          <input
            id="settings-new-password"
            type="password"
            autoComplete="new-password"
            value={fields.next}
            onChange={set("next")}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <Eyebrow as="label" htmlFor="settings-new-password-again" className="block mb-1.5">
            New password again
          </Eyebrow>
          <input
            id="settings-new-password-again"
            type="password"
            autoComplete="new-password"
            value={fields.again}
            onChange={set("again")}
            className={INPUT_CLS}
          />
        </div>
        <p className="text-xs text-text-faint">
          Changing it keeps you signed in on every device. If someone else may
          know your password, ask the admin for a reset link instead: a reset
          signs out every device.
        </p>
        <Button kind="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Slip>
  );
}
