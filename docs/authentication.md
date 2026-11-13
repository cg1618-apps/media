# Authentication

Last verified: 2026-11-13

## What this is for

Authentication answers one question: *who is making this request?* The app has a single login form, a single kind of session (a signed JWT in an HTTP-only cookie), and a single seeded `admin` account plus whatever accounts an admin creates later. This document covers the login/logout round trip, how passwords and tokens are handled, what the browser learns from `/api/auth/me`, and how the React app reacts to being logged in or out. What a logged-in (or anonymous) viewer is *allowed* to see is a separate question, covered in [authorization.md](authorization.md).

## Files

| Concern | File |
| --- | --- |
| Login / me / logout / reset routes | `app/routers/auth.py` |
| Password hashing, the username and password checks, JWT minting | `app/services/security.py` |
| Cookie -> viewer resolution, the session guard | `app/services/rbac/resolver.py` |
| the capability gates | `app/services/rbac/resolver.py` |
| Ending an account's sessions (`revoke_sessions`) | `app/services/domain/accounts.py` |
| One-time codes (reset links) | `app/services/domain/account_codes.py`, `app/models/account_code.py` |
| Rate limiter | `app/services/rate_limit.py` |
| Changing your own password | `app/routers/account.py` |
| Disable / enable, reset links from `/users` | `app/routers/users.py` |
| Box CLI | `app/cli.py` |
| Admin seeding at boot | `app/main.py` (`lifespan`) |
| Settings (`JWT_SECRET_KEY`, expiry, `PUBLIC_BASE_URL`) | `app/config.py` |
| Frontend session state | `frontend/src/contexts/AuthContext.jsx` |
| Route guard | `frontend/src/components/layout/ProtectedRoute.jsx` |
| Login page | `frontend/src/pages/public/Login.jsx` |
| HTTP wrapper | `frontend/src/api/client.js` |
| Tests | `tests/api/test_auth.py`, `tests/api/test_account_lifecycle.py`, `tests/api/test_reset_links.py`, `tests/api/test_account_password.py`, `tests/api/test_users_lifecycle.py`, `tests/unit/test_security.py`, `tests/unit/test_account_policy.py`, `tests/unit/test_rate_limit.py` |

## Login flow

`POST /api/auth/login` takes an `OAuth2PasswordRequestForm` (form-encoded `username` and `password`, not JSON).

1. Lowercase the submitted username. Every name the checks below admit is lowercase, and the lookup compares `lower(users.username)`, which is what `uq_users_username_lower` indexes - so `KaNa` signs in as `kana`.
2. Ask the [rate limiter](#rate-limiting). A username or address over its limit is **429** whatever the password, with `Retry-After` in seconds.
3. If no row, or `verify_password` fails, answer **401** `Incorrect username or password` with a `WWW-Authenticate: Bearer` header, and count one failure against the username and the address. The two failures are deliberately indistinguishable, and a wrong password gets this answer **whatever the account's status**.
4. Only after a **correct** password does the status speak: `pending` is **403** `Your account is waiting for the admin's approval.`, `disabled` is **403** `This account is disabled.` No cookie is set in either case. So an account's status reaches nobody who does not know its password.
5. Clear the username's failure count, mint a JWT (see below) and set it as the `access_token` cookie with the value `Bearer <token>`.
6. Return `{"message": "Successfully logged in", "role": "<role name>"}`.

`POST /api/auth/logout` deletes the cookie (same path/flags) and returns `{"message": "Successfully logged out"}`. It does not need a valid session to succeed. It ends only this browser's session; see [Sessions and their revocation](#sessions-and-their-revocation) for what ends all of them.

There is no self-registration. Accounts are created by an admin through `/api/users` (see [authorization.md](authorization.md)). A forgotten password is recovered by a [reset link](#reset-links), which only the admin (or the box) can issue.

> ### Before inviting anybody
>
> Two things have to hold before a non-administrator has an account here, and
> both do: the login cookie's `Secure` flag follows `APP_ENV`, and
> `Settings.validate_secrets()` runs from the lifespan in **every**
> environment, refusing to boot on a default `JWT_SECRET_KEY` or
> `ADMIN_PASSWORD`. See [The production
> signal](#the-production-signal-app_env) below.

## The production signal (`APP_ENV`)

`APP_ENV` names the runtime: `development` or `production`. A typo is rejected
at settings-validation time rather than interpreted, because "not development"
and "not production" fail in opposite directions and neither announces itself.

**Unset means `production`.** That is the minority convention — Rails, Django,
Laravel and Node all default to development — and it is chosen for the
direction it fails in. A dev machine that forgets `APP_ENV` sets a `Secure`
cookie over plain HTTP, the browser drops it, and login stops working
immediately on the machine you are sitting at. The opposite default lets a
public box run with an insecure cookie and say nothing. ASP.NET Core defaults
to Production for the same reason. Both dev machines therefore carry
`APP_ENV=development` in `.env`, and so does CI.

`Settings.validate_secrets()` is **not** gated on it, and that separation is
the point. It refuses to start while `JWT_SECRET_KEY` or `ADMIN_PASSWORD`
still holds the value `.env.example` ships, in development as well as
production — Django's `SECRET_KEY` raises whether or not `DEBUG` is set, for
exactly the reason this codebase already learned: the previous check,
`validate_production()`, returned early unless it was running on Cloud Run, so
it never fired on a developer's machine and then left with the GCP code
without anybody noticing it had gone. Both problems are reported in one
message, and neither message quotes the offending value.

It is called as the first statement of the lifespan in `app/main.py`, before
the `try` that swallows seeding errors into a printed line, and before the
admin account is seeded from `settings.admin_password` — otherwise the example
password would be hashed into the database before anything objected.

## Passwords (bcrypt)

`app/services/security.py`:

- `validate_new_password` is the check every **new** password passes - `/users` create and set-password, a reset link, and changing your own. It refuses exactly two things, both technical: an **empty** password, which is no credential at all, and one past **72 UTF-8 bytes**, with a 422 that says how many bytes it was. Bytes, not characters - a letter outside basic Latin is two to four. There is **no password policy** beyond that, by the owner's decision: no minimum length and no composition rules, so a one-character password is accepted.
- `get_password_hash` encodes the password as UTF-8 and hashes it with `bcrypt.hashpw` and a fresh salt. It does **not** truncate: every caller has validated the password first, and one that has not gets a `ValueError` rather than a hash of a shorter password than the one it was handed.
- `verify_password` **does** cut its input to 72 bytes before `bcrypt.checkpw`, and returns `False` on any exception (malformed stored hash, bad encoding) rather than raising.

72 bytes is bcrypt's input limit: it reads no further, and bcrypt 5 raises on longer input. A longer password is refused rather than truncated because a quiet truncation accepts any password that agrees with the stored one up to byte 72. `verify_password` keeps the slice because a stored hash may have been made from the first 72 bytes of a longer password: the person still types the whole of it, and without the slice bcrypt would raise and the login would fail.

### Usernames

`validate_new_username` is the policy for every **new** name - `/users` create and rename, and registration: 3 to 32 characters of lowercase letters, digits, `-` and `_`, and never `admin` or `guest` anywhere in the lowercased name (`admin1` and `qadminqe` are refused, `adamin` and `adm1in` are not). It is not applied to the rows that already exist, which is how the `admin` account keeps its name; repeating an existing name unchanged in a `PATCH` is not a new name.

Uniqueness ignores case, and the database holds it: `uq_users_username_lower` is a unique index over `lower(username)`, so `Kai` and `kai` cannot both exist. The `/users` routes ask it before writing and answer **409** `That username is taken.`

### Accounts with no password — `UNUSABLE_PASSWORD_HASH`

`app/services/security.py` also defines `UNUSABLE_PASSWORD_HASH = "!"` and
`is_unusable_password_hash(value)`. `"!"` is not a bcrypt hash and cannot be
produced by `get_password_hash` (every bcrypt hash starts `$2`), so no input
can verify against it: `checkpw` raises on the malformed salt and
`verify_password` returns `False`. Django uses the same leading `"!"`
convention for the same reason.

Accounts carrying it come from **one place**: a Google Sheets Pull. Since Step
4 the `Users` tab carries who exists and what role they hold but deliberately
**not** `hashed_password` — it is credential material for other people's
accounts, and a Backup writes the sheet outside this database's trust boundary
([data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy)). Pull stamps
the marker on an account it creates, and **never** touches an existing
account's hash, so a Pull All cannot lock the admin out of their own machine.
An admin gives such an account a real password through `PUT /api/users/{id}`
at `/users`.

## The JWT

| Item | Value |
| --- | --- |
| Algorithm | `HS256` (`settings.algorithm`) |
| Secret | `JWT_SECRET_KEY` (`settings.jwt_secret_key`) |
| Claims | `sub` = username, `role` = role name, `mode` = the default mode at login, `sv` = `users.session_version` at login, `exp` = now + expiry |
| Expiry | `ACCESS_TOKEN_EXPIRE_MINUTES` = 43200 (**30 days**, flat), also used as the cookie `max_age`. A machine's `.env` overrides the default, so the effective value is per-machine. There is no refresh. The one reissue, after the admin sets its own password on `/users` (see [Sessions and their revocation](#sessions-and-their-revocation)), keeps the original deadline, so a session never outlives the month it was first minted for |

`sv` is the one claim besides `sub` that the server reads - see [Sessions and their revocation](#sessions-and-their-revocation).

The `role` claim is **vestigial**. Nothing reads it for authorization: the server resolves the user's role and permissions from the database on every request (`resolver.py`), so a token minted before a role change carries a stale claim that is simply ignored. It is still minted because the login response and the old `User.role` shape returned it, and `User.role` is now a read-only `column_property` over `role.name` (`app/models/__init__.py`).

`settings.validate_secrets()` runs from the lifespan (`app/main.py`) in every environment and refuses to boot while `JWT_SECRET_KEY` or `ADMIN_PASSWORD` still holds the value `.env.example` ships. It is environment-blind on purpose: a guard that only fires in production is a guard nobody has ever seen fire.

## The cookie

| Flag | Value | Why |
| --- | --- | --- |
| `key` | `access_token` | Read by `resolver._decode`, which expects the `Bearer ` prefix |
| `HttpOnly` | true | `document.cookie` cannot read it; XSS cannot exfiltrate the token |
| `SameSite` | `Lax` | Sent on same-site navigation and fetches; not on cross-site POSTs |
| `Secure` | `not settings.is_development` | Follows `APP_ENV`, not the request scheme: behind a tunnel the scheme is only trustworthy when proxy headers are configured correctly, and a missing header would produce an insecure cookie over HTTPS silently - the failure the flag exists to prevent. Django's `SESSION_COOKIE_SECURE` and Rails' `config.force_ssl` are per-environment settings for the same reason. Read per request rather than at import, so a test can move it. |
| `max_age` | `ACCESS_TOKEN_EXPIRE_MINUTES` × 60, or on a reissue the seconds left until the original deadline | Matches the JWT expiry |

Every login cookie is minted by `set_login_cookie()` in `app/services/domain/accounts.py`, so the claims and the flags above are written in one place: by login, and by `update_user`'s reissue.

The browser sends it automatically; the SPA always fetches with `credentials: "include"`.

A second cookie, `access_mode`, holds a switched-to access mode. It is a
browser-session cookie with the same `HttpOnly`, `SameSite` and `Secure` flags,
its token expires an hour after the switch when the mode is wider than the
account's default and with the login otherwise, and login and logout both
clear it. It does not identify anyone - without `access_token` it is ignored. See
[authorization.md](authorization.md#switching-mid-session-post-apiauthaccess-mode).

## `GET /api/auth/me`

The one place the SPA learns who it is. It **never raises**: a missing, expired or badly signed cookie, a deleted user, or a missing role all resolve to the guest viewer, and even an unexpected exception falls back to `GUEST_FALLBACK`.

```json
{
  "is_admin": false,
  "username": null,
  "role": "guest",
  "is_root": false,
  "permissions": ["field_group.sources_restricted", "media_type.anime", "..."]
}
```

- `is_admin` is `viewer.has("admin")` - true for a root role or any role granted the `admin` permission.
- `username` is `null` for an anonymous caller.
- `permissions` is the sorted grant list of the viewer's role. For a root role it may be empty; `is_root` is what says "everything".

## The capability gates (`app/services/rbac/resolver.py`)

Every write route names the capability it needs — `require_manage_catalog`, `require_manage_pipelines` or `require_admin_authz`. Each calls `resolve_viewer` and requires that one permission; there is deliberately no single "is an admin" dependency, so grepping for a capability finds every route holding it.

- Failure is always **401** with `Could not validate credentials or insufficient permissions` and `WWW-Authenticate: Bearer`. A gate never answers 403: the SPA has one error shape to handle, and a non-admin caller learns nothing about *why* it was refused. (The login route's 403 for a pending or disabled account is not a gate - it answers someone who has just proved they know the password.)
- Because the user row is consulted on each request, a validly signed token for a deleted, disabled or revoked account, or for one whose role has since lost a permission, is rejected immediately. There is no token blacklist or refresh flow to maintain.
- The return value is the decoded JWT payload (or `{sub, role}` built from the viewer). Only `users.py` reads it, for the "cannot delete yourself" guard.

`require_permission(<perm>)` in `resolver.py` is the generalised form for gating a route on any single permission; it answers 401 in the same shape.

## Sessions and their revocation

Two columns on `users` decide whether a signed login cookie still speaks for its account, and `resolve_viewer` checks both right after it looks the account up (`session_is_current` in `resolver.py`). A cookie that fails either resolves to the **guest**, exactly as an expired one does.

- **`status`** - `pending`, `active` or `disabled` (CHECK-constrained, default `active`). Only an `active` account has sessions. `pending` is a registration awaiting approval; `disabled` is an account the admin switched off, reversibly, on `/users`.
- **`session_version`** - an integer, default 0, minted into the token as `sv`. A token is honoured only while its `sv` equals the column. A token with **no** `sv` (minted before the claim existed) reads as 0, every account's starting value, so the deploy that added the claim signed nobody out. A claim that is not an integer is a mismatch.

Incrementing `session_version` ends every session the account holds, at once, with no token list to keep. Every increment goes through `revoke_sessions(user)` in `app/services/domain/accounts.py`, so grepping that name answers "what signs an account out":

| Event | Revokes? |
| --- | --- |
| A reset link spent | yes |
| The admin disabling the account on `/users` | yes |
| The admin setting the account's password on `/users` | yes - `ADMIN_SET_PASSWORD_REVOKES_SESSIONS = True`, the owner's decision; it matters most for a leaked shared login. When the account is the admin's **own**, every session still ends, but the browser that made the change gets a fresh login cookie at the new counter, so it stays signed in and every other device is signed out (`KEEP_OWN_SESSION_ON_ADMIN_SET_PASSWORD`, the owner's decision). `/users` is the admin's only way to change its own password, because the root role does not hold `self.password`. The fresh cookie keeps the **original deadline**, so a password change never extends a login |
| Enabling a disabled account | no - its sessions ended when it was disabled, and enabling does not revive them |
| Changing your own password (`PUT /api/account/password`) | no - the person changing it is the one holding the session |
| Logging out | no - it clears one browser's cookie |
| Renaming the account | not through the counter, but every token names the old username in `sub` and so resolves to nobody |

After the commit, each of these routes calls `rbac.cache.bump()`, because the cover route caches a resolved viewer per cookie (`cover_viewer.py`).

`session_version` is this machine's counter and never travels on the Sheets `Users` tab; `status` does, for `active` and `disabled` ([data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy)).

## Reset links

A reset link lets one account set a new password without being signed in. Only the admin issues one - from `/users`, or from the box when nobody can sign in at all - and hands it over however they like; nothing is emailed.

| Step | Route | What happens |
| --- | --- | --- |
| Issue | `POST /api/users/{id}/reset-link` (`admin.authz`) | `{link, expires_at}`, **once**. 409 for an account that is not `active`, or whose role is `shared`. Any unspent reset link the account already has is deleted in the same transaction: a newer link stops an older one working |
| Check | `GET /api/auth/reset?code=` | `{username}` without spending the code, so the page can say whose password is being set |
| Spend | `POST /api/auth/reset` `{code, password}` | Spends the code, sets the password and increments `session_version`, in one transaction. Clears this browser's login and mode cookies. Returns `{username}` so the SPA can pre-fill the sign-in form |

**Codes.** `app/services/domain/account_codes.py` over the `account_code` table ([data-model.md](data-model.md)). A code is 32 random bytes (`secrets.token_urlsafe(32)`), and only its **SHA-256** is stored - a fast hash is the standard choice for a high-entropy token, since there is nothing to brute-force, and it lets the row be found by its hash; bcrypt is for low-entropy passwords. The link is `PUBLIC_BASE_URL` + `/reset?code=<code>` and cannot be shown again. It expires 24 hours after it is issued.

**Refusals are one message.** An unknown code, a spent one, an expired one, one minted for another purpose, and one whose account has since been disabled or made shared all answer **404** `This link is not valid. Ask the admin for a new one.` - telling them apart would let someone holding a guessed or stale link learn which codes ever existed.

**Spending** is `spend_code(db, code, purpose)`: `SELECT ... FOR UPDATE` on the row by hash, refuse it if unusable, set `spent_at`. The new password is checked in the same transaction, so a refused password (**422**) rolls the spend back and a typo does not burn the link. Two requests racing with one link cannot both spend it: the second waits on the lock, then reads `spent_at`.

**Shared accounts** (role `shared`) never get one: several people know such an account's password, so whoever opened the link would take the account from the rest. The admin sets its password on `/users`. The check keys on the role name through `SHARED_ROLE_NAME` in `permissions.py`.

### From the box: `python -m app.cli reset-link`

When nobody can sign in to `/users` - the admin included - the box issues the same link:

```bash
docker compose exec media-app python -m app.cli reset-link <username>
```

`app/cli.py` (argparse, one subcommand) finds the account ignoring case and calls the same `issue_reset_link`, with no issuer recorded (`created_by_id` is null). It prints the link and its expiry and exits 0; an unknown account, or one that may not have a link, prints why on stderr and exits 1. The link's host comes from `PUBLIC_BASE_URL` - there is no request to read one from - whose default is production's address, so the box needs no variable for it.

## Changing your own password

`PUT /api/account/password` `{current_password, new_password}` on `app/routers/account.py`, gated on **`self.password`** ([authorization.md](authorization.md)). A wrong current password is **400** `Your current password is not right.`, not 401, which the SPA reads as a lost session. The new password passes `validate_new_password` (422 otherwise). It returns `{"message": "Password changed."}` and does **not** touch `session_version`.

The root admin does not hold `self.password` - the self family is outside the root short-circuit - so the admin sets its own password on `/users`.

## Rate limiting

`app/services/rate_limit.py` is an in-process fixed-window counter keyed by string: `check(key, limit)` returns the seconds until the key's window ends once it has reached `limit`, `hit(key, window)` counts one, and `reset(key)` forgets a key. A refusal is **429** `Too many attempts. Try again in N minutes.` with a `Retry-After` header in seconds. The limits are the owner's, and live as constants at the top of `app/routers/auth.py`:

| Route | Key | Limit per 15 minutes |
| --- | --- | --- |
| `POST /api/auth/login` | the lowercased username | 5 **failed** attempts. A correct password clears the count |
| `POST /api/auth/login` | the address | 20 failed attempts, over any usernames |
| `GET` and `POST /api/auth/reset` | the address | 10 requests, counted whether or not they succeed - the GET alone answers "is this code real" |

A locked username stays locked whatever is typed, the right password included, until its window ends.

**It assumes one process.** The box runs one uvicorn process (`entrypoint.sh` passes no `--workers`), so one dict sees every request. A second worker process would hold a second dict and double every limit; adding one needs a shared store behind the same three functions. A restart forgets every count, which errs toward letting someone in rather than locking them out. The address is `request.client.host`, which is the visitor rather than the tunnel only because uvicorn runs with `--proxy-headers`.

There is no library: slowapi keys per route, and the login limit needs a per-username key as well. The tests empty the limiter around every test (`_clear_rate_limits` in `tests/api/conftest.py`), since every test client calls from the same address.

## Admin seeding at boot

`lifespan` in `app/main.py`, before the first request:

1. `ensure_rbac_seed(db)` creates the `guest` and `admin` roles if missing (idempotent - see [authorization.md](authorization.md)).
2. If a `users` row named `admin` exists with a `NULL` `role_id` (a row from before the RBAC migration, or restored from a backup), it is attached to the `admin` role.
3. If no `admin` user exists at all, one is created with `ADMIN_PASSWORD` (default `admin123`) hashed via `get_password_hash` and `role_id` = the admin role.

Any exception during seeding is printed and swallowed so the server still starts; check the boot log for `Critical Error during seeding`.

## Frontend

### `AuthContext` (`frontend/src/contexts/AuthContext.jsx`)

`AuthProvider` fetches `/api/auth/me` on mount and exposes, via `useAuth()`:

| Field | Meaning |
| --- | --- |
| `isAdmin` | `is_admin` from the server; the flag every existing "show this control" check reads |
| `username` | `null` when anonymous |
| `role` | Role name, `"guest"` by default |
| `isRoot` | Mirrors the server flag |
| `permissions` | Array of grant strings |
| `has(permission)` | `isRoot || permissions.includes(permission)` - same semantics as `Viewer.has` on the server, backed by a `Set` |
| `loading` | True until the first `/me` response |
| `refetchAuth()` | Re-runs the `/me` fetch. Nothing calls it on an identity change - see below |

A failed or non-OK `/me` request resets to the anonymous snapshot rather than erroring. Hiding in the UI is cosmetic - the server has already withheld anything the viewer may not see.

### `ProtectedRoute` and `?next`

`<Route element={<ProtectedRoute />}>` wraps every admin page in `App.jsx`. It takes an optional `permission` prop (default `"admin"`), shows a spinner while `loading`, then either renders the `<Outlet />` or redirects to `/login?next=<current path + search>` with `replace`.

`Login.jsx` posts the form, then **loads** `next` **only if it starts with `/`** (an absolute path on this site) and does not point back at `/login`, otherwise `/system`. The first test prevents an open redirect through the query string; the second stops a `next` that lands a signed-in visitor on the login form again.

### Saved usernames on the login page

The login form keeps up to three usernames in this browser's `localStorage`
under `cg1618:saved-users`, so the accounts that share a machine can be swapped
without retyping. The list is read and written by
`frontend/src/lib/savedUsers.js`; the login page is the only thing that touches
it.

| | |
|---|---|
| What is stored | The username string only. No password, no token, no server record. |
| When | On a **successful** sign-in, so a typo never takes a slot. |
| Cap | Three. A fourth username is **not** saved and nothing is evicted - the three stay until one is removed by hand. |
| Order | Most recently used first; signing in again as a saved user moves it to the front. |
| Removing | The `×` on each entry drops it immediately, and frees the slot. |
| Clicking one | Fills the username field and focuses the password. It does **not** authenticate - there is no stored credential to authenticate with. |

Swapping users is still sign out, then sign in: the saved list shortens the
second half of that, nothing more. A read or write that throws (a private
window, blocked site data, a full quota) degrades to an empty list rather than
breaking the form.

### An identity change is a full page load

Signing in, signing out and switching access mode all leave the SPA and load a
URL from scratch, through `hardNavigate()` in `frontend/src/lib/hardNavigate.js`.
None of the three swaps the auth snapshot and stays put.

Swapping the snapshot is not enough, and the failure is a leak rather than a
cosmetic one: every answer React Query has already cached was computed for the
outgoing identity, and `staleTime` (30 s, `refetchOnWindowFocus` off) serves
those cached answers again without asking the server. Signing out on a
dashboard therefore left the previous account's rows on screen, to a guest,
until something happened to evict them. Clearing the query cache would fix that
half and not the other: component state holds the same rows in places the cache
does not own.

A full load fixes both by construction, and it is the browser doing something
it already does well. What it costs is a flash and any unsaved form state -
both acceptable at the moment WHO the session is has changed. `ProtectedRoute`
then decides where the new identity may actually stand.

### No automatic redirect on 401

`fetchJson` in `frontend/src/api/client.js` does **not** intercept 401. Any non-2xx response throws an `Error` whose message is the backend `detail` (or `message`, or the HTTP status text); a 204 resolves to `null`. Pages and mutation hooks decide what to do with the error - typically a toast. So an admin whose cookie expired mid-session sees failed writes, not a forced trip to the login page, until they navigate to a protected route and `ProtectedRoute` sends them there. This is intentional: an in-progress form is not thrown away by a background 401.

## Known gaps

- **The rate limiter is per process** and forgets on restart - see [Rate limiting](#rate-limiting).
- **A member cannot end their own other sessions.** Changing your own password leaves them alive by design; a reset link or the admin is what ends them.
- **`JWT_SECRET_KEY` rotation logs everyone out**, since there is no key id or grace list.
