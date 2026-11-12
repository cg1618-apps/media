# Account and authorization system — design

**Status: under discussion. Nothing here is built, and nothing is built until
every open question below is answered.** The scope is the whole account and
authorization system — users, roles, access modes, content labels and
authentication together. Implementation starts from this document once it has
no open questions; it is then turned into a plan, and both are deleted when
the work lands (see the platform `CLAUDE.md`, "Finishing a plan").

Current behaviour is in `docs/authorization.md` and `docs/authentication.md`;
where this document says "today", it was read from those, from the code, and
from the company development database.

## The owner's structure

### Roles

- **`admin`** — managing only; keeps no media data of its own. There is one
  admin account, the owner's, and it stays admin: it cannot change its own
  role. It creates **only** `user`-family accounts (`user`, `super`), never
  `admin`, `guest` or `shared` accounts. It edits each account's access
  mode, detail access settings and password.
- **`user`** family — `super` and the ordinary `user`. Each account has a
  username, a password and its own media data.
- **`guest`** — the **logged-out visitor**, and nothing else. Read-only.
- **`shared`** — **two shared accounts**, one in `normal` and one in
  `borderline`: a single login each, used by several people. They have a
  username and password; admin can change their password but cannot delete
  them. "Guest" means only the logged-out visitor; a shared account is
  logged in.
- Each role has some settings the admin can change and some that are fixed.
  **To discuss:** which are which.
- **To discuss:** what belongs to each user (personal notes, reviews, …) and
  what everyone sees; what guests and shared accounts can read.
- **Admin and guests get different pages and layout.** Partly built for the
  logged-out visitor. **To discuss:** the details.

### Access modes

- **Exactly four: `unrestricted`, `borderline`, `normal`, `safe`.** The admin
  cannot create or delete modes.
- **`unrestricted` always reaches everything.**
- Each mode has some settings the admin can change and some that are fixed
  (hard vs manual restrictions). **To discuss:** which are which.
- An account is bound to a **ceiling** — the highest mode it may use — and a
  **default** mode it starts in at login.

### Content labels

- Labels exist for access modes only.
- The admin edits a label's description and can delete selected labels.
- A label attaches to a group or a media entry.
- Labels should carry business logic, which they do not today. A candidate:
  labels defined in code, with the admin managing only description (and
  deletion). **To discuss**, together with optimising the labels.
- **Every entry carrying a label other than `nsfw` (e.g. `erotica`) also
  carries `nsfw`.**

### Account features

- Shared accounts and users get features such as requesting a new media
  entry and reporting a data error or bug. The logged-out guest does not.

## Settled

### Identity and recovery

- **No email address or phone number on an account.**
- **Recovery is an admin-issued reset code**, which also recovers a forgotten
  username:
  - `/users` offers **Reset code** on an `active` account. The code (e.g.
    `K7QM-3XWP`) and a link `https://media.cg1618.com/reset?code=…` are shown
    **once**, with the expiry; only a hash is stored. It is single-use and
    expires after 24 hours; generating a new one voids any unused earlier one.
  - The person contacts the admin outside the app (there is no in-app
    "forgot" request — a logged-out form identifies nobody, and the code
    still has to be handed over out of band). The admin passes on the code
    or link.
  - Login page link **"Forgot your password or username?"** → `/reset`. The
    link pre-fills the code. A valid code shows **"Setting a new password for
    <username>"** without spending it; the new password (typed twice, checked
    against the password policy) is saved in one transaction that spends the
    code, sets the password and **ends every existing session**. They then
    log in, with the username pre-filled.
  - A wrong, expired or spent code gets one generic message; `/reset` is
    rate-limited like login.
  - **Box-side CLI** for the admin's own lockout:
    `docker compose exec media-app python -m app.cli reset-code <username>`
    prints a code for the same `/reset` page — one reset path, not two.
- **Invite and reset codes share one table**, `account_code`, with a
  `purpose` (`invite` / `reset`) and, for a reset, the target user: one
  generator, one hashing rule, one spend-once transaction.
- **Session revocation** is a per-user counter that a reset increments; the
  login token carries the value it was minted under, and an older one is
  refused. No session table.
- **Users change their own password** in account settings, with the current
  password. It does not end their other sessions.
- The admin keeps the ability to set any account's password directly.

### Sessions

- **Logins stay 30 days flat.** No sliding refresh.
- **Nothing ends sessions except a reset or disabling the account** — no
  "log out everywhere", no admin force-logout.

### Account status

- `users.status`: `pending` / `active` / **`disabled`**. Disabled cannot log
  in, its sessions end, its data is kept, and `/users` reverses it.
- Accounts created on `/users` are `active` at once.

### Self-registration by invite code

- The admin generates a single-use invite code (24 h) and hands it over; the
  invitee submits code, username and password to a public register endpoint;
  the account is created `pending` and cannot log in. An approval panel on
  `/system` lists pending requests.
- Consuming the code and creating the account happen in one transaction.
- Invite codes and pending accounts do **not** travel on the Sheets Users
  tab; the R2 `pg_dump` needs no change, since `hashed_password` is bcrypt.
- **The hardening ships with it**, not after: a password policy (minimum
  length; reject rather than truncate past bcrypt's 72 bytes), revoking
  sessions on an admin reset, and rate limiting on register, login and reset.
- **A pending account learns it is pending only after a correct password.**
  A wrong password gets the ordinary generic 401.
- **Reject deletes the pending account**; a log line is the record and the
  invite code stays spent.
- **Approval sets role and access modes together** on one form. An invite
  code carries no role or modes.
- **Usernames match `[a-z0-9_-]{3,32}`, are unique case-insensitively, and
  may not contain `admin` or `guest` anywhere**, compared lowercased
  (`gUesT` counts). It is a substring test, not a similarity test: `admin1`
  and `qadminqe` are refused, `adamin` and `adm1in` are allowed. Only those
  two words are reserved.
- **The approval form defaults to the `user` role, with ceiling `normal` and
  default mode `normal`**; so does an account created on `/users`. This
  replaces the earlier rule that every new account starts in `safe`: a user
  can switch up to their ceiling at once, so starting lower protects
  nothing. Which roles the form offers is difference 3 below.

### Shared accounts

- **The two shared accounts have their own role, `shared`**, fixed and
  seeded by the system — not the logged-out `guest` role, so what visitors
  can read and what shared accounts can read are tuned separately.
- **Only the admin changes a shared account's password.** The account
  settings page offers no password change: one person changing it would
  lock out everyone else using the login.
- **Shared accounts can file requests and reports**; the shared account is
  the author. Logged-out guests cannot.
- `shared` is **not** a reserved username word: shared accounts are seeded,
  never registered, so only `admin` and `guest` stay reserved.

### Roles and modes

- **Only the owner holds `admin`.** The four seeded roles and custom roles
  stay.
- **The four modes stay.**
- **A registered user can hold `unrestricted`, but never from the approval
  form**; the admin grants it later on `/users`, per person.
- **Only the admin manages per-account restrictions, and only the admin sees
  them.** Users cannot narrow their own view; account settings show no
  labels, denials or per-mode options. A user's own controls are the mode
  switcher (among modes they hold), the `list_is_public` toggle and changing
  their password.

## Where the structure differs from today

1. **Mode ceiling instead of a mode set.** Today an account holds any *set*
   of modes plus a default, and modes are deliberately unordered. A ceiling
   implies an order `safe < normal < borderline < unrestricted` and requires
   **each mode to contain the one below it** — which then has to be a fixed
   rule the admin's edits cannot break. Today nothing stops `normal` from
   showing something `borderline` hides. Recommended: it matches how the
   modes are used (`admin` and `cg1618` both hold all four, default
   `unrestricted`).
2. **No mode creation or deletion.** Today `POST` and `DELETE
   /api/access-modes` exist; both go, and editing the adjustable parts stays.
3. **`/users` creates only `user`/`super`.** Today it accepts any role. This
   also narrows the approval form from "every role except `admin`" to
   `user`/`super`.
4. **Admin cannot change its own role.** Today only the last-admin guard
   stops it; make it an explicit 409.
5. **The two shared accounts and the `shared` role are new.** Today the
   logged-in guest accounts do not exist as such. The accounts cannot be
   deleted; recommended: their role cannot be changed either.
6. **Requests and reports** do not exist. Recommended: one table (type,
   optional target entry, body, status, author) and an admin inbox on
   `/system` beside pending registrations.
7. **Labels defined in code.** Recommended — gated types and field groups
   already work that way, and it is what lets a label carry rules (the lowest
   mode that shows it, which labels it implies). It conflicts with **deleting
   a label in the app**: a code-defined label is recreated on the next start,
   so either deletion goes or removing a label is a code change.
8. **Label implication is not enforced.** On the company database all 12
   `erotica` entries already carry `nsfw`, but nothing guarantees it — and
   134 `h-comic`, 59 `h-game` and 10 `hentai` entries carry no `nsfw`.
   Recommended: implied labels are added automatically on write, the way a
   gated type's label is, with a migration to backfill.
9. **Labels on groups.** Today labels attach to entries and **franchises**
   only — not collections or series.

## Open questions

1. **Is a shared account's mode editable** by the admin? Each is named for
   its mode (`normal`, `borderline`).
2. **Label deletion vs labels in code** — see difference 7.
3. **Do the gated-type labels imply `nsfw`?**
4. **Does "group" mean collection, franchise and series**, or franchise only?
5. Still to discuss in full: fixed vs adjustable settings per role and per
   mode; per-account detail settings; what belongs to each user and what
   everyone sees; what guests and shared accounts can read; admin and guest
   layouts; optimising the labels.
