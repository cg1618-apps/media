// Frontend: the account's own settings page. Read-only today: it says which
// account the session is and the role it holds. Nothing about an account's
// data is shareable, so there is no visibility switch to offer.
import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { Eyebrow, Slip } from "../../components/ui/primitives";
import { useToast } from "../../hooks/useToast";

export default function Settings() {
  const { showToast } = useToast();
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
    </div>
  );
}
