# Account lifecycle: revocation, reset and invite links, registration

## Status, revocation and reset links

- **Revocation is a counter, not a session table.** Each login token carries
  `sv`, the account's `users.session_version` when it was minted, and a token
  whose `sv` differs resolves as the guest. One increment ends every session at
  once, with no token list to keep. Every increment goes through
  `revoke_sessions()`, so grepping that name answers "what signs an account
  out".
- **What ends sessions:** a spent reset link, disabling, and an admin setting a
  password on `/users` — a new password is worthless against a leaked shared
  login if the old sessions carry on. Changing your own password does not, since
  you hold the session.
- **When the admin sets its own password**, every session ends and the browser
  that made the change gets a fresh cookie at the new counter, as Django's
  `update_session_auth_hash` does — otherwise the admin would sign itself out
  whenever it used `/users`. **The fresh cookie keeps the original deadline**:
  logins are a flat 30 days, so a reissue minting a new month would let any
  password change extend a session without end.
- **No password policy.** Two technical checks remain: an empty password is
  refused, and one past 72 UTF-8 bytes is refused rather than truncated, since
  bcrypt reads only 72 and truncating would accept a different password.
- **Codes are hashed with SHA-256, not bcrypt.** 32 random bytes need no slow
  hash, and a fast one lets the row be found by its hash. Spending locks the
  row, so two racing requests cannot both use a link; a failed password check
  rolls the spend back, so a typo does not burn it.
- **Rate limiting is an in-process counter, not slowapi.** The box runs one
  uvicorn process, and login needs a per-username key, which slowapi's
  per-route keys do not give; a second worker would need a shared store. **The
  per-username limit is checked before the password**, so wrong guesses lock
  the name even for its real owner — the standard price of brute-force
  protection.
- **`disabled` travels on the Users tab; `session_version` never does.** A Pull
  must not re-activate a disabled account; the counter counts this machine's
  logins.
- **A shared account may be disabled** — reversible, unlike deletion, and the
  fastest way to stop a leaked shared login.
- **Usernames are unique ignoring case**, by a `lower(username)` index. The
  name rules apply to new names only.

## Invite links and registration

- **No invite, no registration.** There is no open sign-up; the register routes
  refuse any request without an unspent, unexpired invite code, with the same
  404 a reset link's refusals give.
- **A registration arrives `pending`, on `user`, with no mode.** Nothing the
  registrant typed decides what it can see; with no mode, a pending account
  resolves the empty object set even if a route forgot to check its status.
- **The approval form never hands out `unrestricted`**; that is granted later on
  `/users`, per person.
- **Invites have their own `created_user_id`, `ON DELETE SET NULL`.** A reset
  link's `user_id` cascades, but declining a registration deletes the account,
  and the invite must survive it as spent or the declined person could register
  again. One foreign key cannot carry both rules.
- **Open invites do not void each other**, unlike reset links: each is for a
  different person.
- **A refused or taken name rolls the spend back.** A taken name is a 409; that
  says the name exists, acceptable on a route that already needs a valid invite.
- **A pending account does not travel and is never the installation owner.** A
  registration is approved on the machine it arrived on.
