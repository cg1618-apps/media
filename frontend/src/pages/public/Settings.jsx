// Frontend: the account's own settings - list visibility, and the password.
//
// The visibility toggle writes on change rather than behind a Save button:
// it is one field, and a Save button for one boolean is a second click that
// can only be forgotten. The switch reflects the server's answer, not the
// click, so a refused write leaves it where it was.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
  const [saving, setSaving] = useState(false);

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

  async function setPublic(next) {
    setSaving(true);
    try {
      const updated = await fetchJson(endpoints.account.settings(), {
        method: "PATCH",
        ...jsonBody({ list_is_public: next }),
      });
      setSettings(updated);
      showToast(
        "success",
        updated.list_is_public ? "Your list is public." : "Your list is private.",
      );
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-text-faint">Loading settings...</div>;
  }

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-text-muted">
        Sign in to change your settings.
      </div>
    );
  }

  const profilePath = `/user/${settings.username}`;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <Eyebrow className="mt-1">Account</Eyebrow>
        <p className="mt-1 text-sm text-text-muted">
          <span className="font-mono">{settings.username}</span>
          <span className="text-text-faint"> · {settings.role_name}</span>
        </p>
      </header>

      <Slip title="List visibility">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.list_is_public}
            disabled={saving}
            onChange={(e) => setPublic(e.target.checked)}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block text-sm text-text">Make my list public</span>
            <span className="block text-sm text-text-muted mt-1">
              A public list can be read by any member at{" "}
              <Link to={profilePath} className="text-brand underline">
                {profilePath}
              </Link>
              , and its ratings count towards the community figures on an
              entry&apos;s page. Your personal notes stay private either way.
            </span>
          </span>
        </label>
      </Slip>

      {/* self.password, not "signed in": a shared account has no password
          of its own to change, and the root admin sets its own on /users
          (has() does not short-circuit the self family for it). */}
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
