// Frontend: page component file for Register - where an invite link lands.
//
// /register?code=... is in no menu: the only way here is an invite link the
// admin hands out (POST /api/users/invites). The page first asks the server
// whether the code can be used WITHOUT spending it. Only a code the server
// accepts gets a form; anything else gets one message, the server's own, so a
// wrong, expired and used link look the same - the shape of ResetPassword.
//
// A registration does not sign anybody in: the account arrives `pending` and
// waits for the admin's approval, so the page ends on saying exactly that.
// The server is authoritative on the username and password rules; the form
// states them and checks only what newPasswordProblem mirrors.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { buildUrl, fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { Button, Eyebrow, Slip } from "../../components/ui/primitives";
import { newPasswordProblem } from "../../lib/newPassword";

// The server's 404 detail, used as-is when there is no code to ask about.
const INVALID_LINK = "This link is not valid. Ask the admin for a new one.";

const INPUT_CLS =
  "w-full px-3 py-2 border border-border-strong bg-surface text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition";

export default function Register() {
  const location = useLocation();
  const code = new URLSearchParams(location.search).get("code") ?? "";
  // null while asking; then {valid: true}, {error} or {registered: username}.
  const [state, setState] = useState(code ? null : { error: INVALID_LINK });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    fetchJson(buildUrl(endpoints.auth.register(), { code }))
      .then(() => !cancelled && setState({ valid: true }))
      .catch((err) => !cancelled && setState({ error: err.message || INVALID_LINK }));
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
      const data = await fetchJson(endpoints.auth.register(), {
        method: "POST",
        ...jsonBody({ code, username, password }),
      });
      setState({ registered: data.username });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Slip title="Register" className="w-full max-w-md" bodyClassName="p-8">
        <header className="mb-8">
          <h1 className="font-display text-4xl font-semibold text-text leading-none">
            New account
          </h1>
        </header>

        {state === null && (
          <p className="text-sm text-text-faint">
            <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>
            Checking the link…
          </p>
        )}

        {state?.error && (
          <p role="alert" className="text-sm text-text-muted">
            {state.error}
          </p>
        )}

        {state?.registered && (
          <p role="status" className="text-sm text-text-muted">
            Your account is waiting for the admin&apos;s approval.
          </p>
        )}

        {state?.valid && (
          <>
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
                <Eyebrow as="label" htmlFor="register-username" className="block mb-1.5">
                  Username
                </Eyebrow>
                <input
                  id="register-username"
                  autoComplete="username"
                  aria-describedby="register-username-help"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={INPUT_CLS}
                />
                <p id="register-username-help" className="mt-1.5 text-xs text-text-faint">
                  3–32 characters: a–z, 0–9, _ and -. It may not contain
                  &ldquo;admin&rdquo; or &ldquo;guest&rdquo;.
                </p>
              </div>
              <div>
                <Eyebrow as="label" htmlFor="register-password" className="block mb-1.5">
                  Password
                </Eyebrow>
                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <Eyebrow as="label" htmlFor="register-password-again" className="block mb-1.5">
                  Password again
                </Eyebrow>
                <input
                  id="register-password-again"
                  type="password"
                  autoComplete="new-password"
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <Button kind="primary" type="submit" disabled={saving} className="w-full py-2.5">
                {saving ? "Registering…" : "Register"}
              </Button>
            </form>
          </>
        )}
      </Slip>
    </div>
  );
}
