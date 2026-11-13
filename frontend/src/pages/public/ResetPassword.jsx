// Frontend: page component file for ResetPassword - where a reset link lands.
//
// /reset?code=... is in no menu: the only way here is a link the admin hands
// out (POST /api/users/{id}/reset-link, or the CLI on the box). The page first
// asks the server whose account the code is for WITHOUT spending it, and shows
// that username - which is also how a forgotten username is recovered. Only a
// code the server accepts gets a form; anything else gets one message, the
// server's own, so a wrong, expired and used link look the same.
//
// A successful reset ends every session of the account, and the server
// clears this browser's login cookies with it. So the way out is a FULL page
// load of /login, as signing out is (lib/hardNavigate.js): anything cached up
// to now was cached for whoever this browser was signed in as.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { buildUrl, fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { Button, Eyebrow, Slip } from "../../components/ui/primitives";
import { hardNavigate } from "../../lib/hardNavigate";
import { newPasswordProblem } from "../../lib/newPassword";

// The server's 404 detail, used as-is when there is no code to ask about.
const INVALID_LINK = "This link is not valid. Ask the admin for a new one.";

const INPUT_CLS =
  "w-full px-3 py-2 border border-border-strong bg-surface text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition";

export default function ResetPassword() {
  const location = useLocation();
  const code = new URLSearchParams(location.search).get("code") ?? "";
  // null while asking; then either {username} or {error}.
  const [target, setTarget] = useState(code ? null : { error: INVALID_LINK });
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    fetchJson(buildUrl(endpoints.auth.reset(), { code }))
      .then((data) => !cancelled && setTarget({ username: data.username }))
      .catch((err) => !cancelled && setTarget({ error: err.message || INVALID_LINK }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = newPasswordProblem(password, again);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await fetchJson(endpoints.auth.reset(), {
        method: "POST",
        ...jsonBody({ code, password }),
      });
      hardNavigate(buildUrl("/login", { username: data.username }));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Slip title="Reset" className="w-full max-w-md" bodyClassName="p-8">
        <header className="mb-8">
          <h1 className="font-display text-4xl font-semibold text-text leading-none">
            New password
          </h1>
        </header>

        {target === null && (
          <p className="text-sm text-text-faint">
            <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>
            Checking the link…
          </p>
        )}

        {target?.error && (
          <p role="alert" className="text-sm text-text-muted">
            {target.error}
          </p>
        )}

        {target?.username && (
          <>
            <p className="text-sm text-text-muted mb-6">
              Setting a new password for{" "}
              <span className="font-mono text-text">{target.username}</span>.
              Saving signs this account out everywhere.
            </p>

            {error && (
              <div
                role="alert"
                className="border border-danger text-danger px-3 py-2 mb-6 text-sm"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Eyebrow as="label" htmlFor="reset-password" className="block mb-1.5">
                  New password
                </Eyebrow>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <Eyebrow as="label" htmlFor="reset-password-again" className="block mb-1.5">
                  New password again
                </Eyebrow>
                <input
                  id="reset-password-again"
                  type="password"
                  autoComplete="new-password"
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <Button kind="primary" type="submit" disabled={saving} className="w-full py-2.5">
                {saving ? "Saving…" : "Save password"}
              </Button>
            </form>
          </>
        )}
      </Slip>
    </div>
  );
}
