# Account and authorization system — design

**Status: under discussion. Nothing here is built, and nothing is built until
every open question below is answered.** The scope is the whole account and
authorization system — users, roles, access modes, content labels and
authentication together. Implementation starts from this document once it has
no open questions; it is then turned into a plan, and both are deleted when
the work lands (see the platform `CLAUDE.md`, "Finishing a plan").

The user-facing side — kinds of account, signing in, registering, resetting and changing a password, in plain
language — is `docs/account.md`, its own page, not part of
`docs/authorization.md`. It marks what is not built yet; each "not available
yet" goes in the change that builds it, and a decision here that changes what
a user sees changes that page too. The technical side of the same flows goes
in `docs/authentication.md`. What is the catalogue and what is a user's own
data, for the same readers, is `docs/catalogue.md`.

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
- Labels are defined in code, and carry business logic there. The admin
  attaches and detaches them but no longer creates, edits or deletes them.
- A label attaches to a group (collection, franchise or series) or a media
  entry.
- **Every entry or group carrying a label other than `nsfw` (e.g. `erotica`)
  also carries `nsfw`.**

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

### Content labels

- **Labels are defined in code**, the way gated types and field groups are;
  that is what lets a label carry rules. The admin does not create, edit or
  delete them in the app.
- **Every label other than `nsfw` requires `nsfw` to be stored, not merely
  implied** — gated-type labels (`h-comic`, `h-game`, `hentai`) included.
  Attaching such a label attaches `nsfw` in the same write; detaching `nsfw`
  while one of them is attached is refused. A migration backfills the
  entries and franchises that lack it, and every write path — the forms,
  Pull, the gated-type auto-label — goes through the same rule.
- **Labels attach to collections, franchises, series and entries.** A
  group's label cascades down, as a franchise's does today: a collection's
  hides its franchises, series and entries; a series' hides its entries.
- **Each label is defined once in code**: key, display name, description,
  the lowest mode that shows it, and whether a gated type carries it. The
  modes form the order `safe < normal < borderline < unrestricted`, so "the
  lowest mode" fixes every mode's answer, and the admin cannot change it.

  | key | lowest mode | description |
  | --- | --- | --- |
  | `nsfw` | `normal` | 不適合公開場合觀看 |
  | `erotica` | `borderline` | 擦邊肉番 |
  | `hentai` | `unrestricted` | 成人動畫 |
  | `h-game` | `unrestricted` | 成人遊戲 |
  | `h-comic` | `unrestricted` | 成人漫畫 |

  The `h-game` and `h-comic` rows keep what their descriptions say today;
  the descriptions are drafts for the owner to correct.
- **Descriptions are in Chinese and say only what the label marks.** Who
  sees a label is not written in prose: the chip tooltip and the admin's
  label page generate it from the rule ("shown in", "also carries"), so it
  cannot drift from the rule.
- **`/content-labels` becomes a read-only reference** for the admin — each
  label, what it marks, which modes show it, and how many items carry it.
- **`nsfw` at `normal` is a change from today**, where `normal` hides it
  (only `borderline` holds `nsfw` and `erotica`; `unrestricted` holds the
  three gated labels). On the company database that makes 4 entries and
  3 franchises — those carrying `nsfw` alone, and the franchises' entries —
  visible in `normal`.

### Shared accounts

- **The two shared accounts have their own role, `shared`**, fixed and
  seeded by the system — not the logged-out `guest` role, so what visitors
  can read and what shared accounts can read are tuned separately.
- **Shared accounts' modes are fixed**: each account's ceiling and default
  are its own mode, `normal` or `borderline`, and `/users` does not edit
  them.
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
  switcher (among modes they hold) and changing their password.

### Privacy

- **There is no list visibility setting.** `users.list_is_public` and the
  Settings "List visibility" card go.
- **Everything per user is private to its account.** No other account
  reads another's list, ratings, plan, copies, choice marks or personal
  notes. So these go with the setting, since each could only ever be empty:
  the public profile (`/user/<username>`), reading notes by author
  (`?author=`), and the community card and `/api/community/`.
- **Requests and reports are not user data in this sense.** They are
  addressed to the admin, who reads them in the inbox.
- **User data is private from the admin too.** Today `admin.authz` opens
  any profile whatever its setting; that override goes with the profile,
  and nothing in the app shows the admin a user's list, ratings or notes.
- **`field_group.personal_notes` goes too**: it only decides whether a mode
  may read *another* user's personal notes, which nobody can any more.
- `view.personal` keeps only what is not another member's data — today's
  owner ratings and expectations on catalogue rows — and shrinks further if
  those move to the user (see "Catalogue and user data"). Highlights become
  personal, so they leave it.

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
   deleted, and their mode is fixed; recommended: their role cannot be
   changed either.
6. **Requests and reports** do not exist. Recommended: one table (type,
   optional target entry, body, status, author) and an admin inbox on
   `/system` beside pending registrations.
7. **Labels move into code.** Today they are admin-created rows on
   `/content-labels`, editable and deletable in the app. That page's create,
   edit and delete go; removing a label becomes a code change and a
   migration.
8. **The `nsfw` rule is not enforced today.** On the company database all
   12 `erotica` entries already carry `nsfw`, but nothing guarantees it — and
   134 `h-comic`, 59 `h-game` and 10 `hentai` entries carry no `nsfw`.
9. **Labels attach to franchises only, among groups.** Collections and
   series are new.

## Catalogue and user data

**Designs come from the owner**: once the owner has
reviewed the whole of this split, they provide the designs for how moved
data looks and is edited (highlights as personal sections, per-user ratings
and the rest). Implementation does not invent them. The catalogue is one copy everyone shares; user data is
one copy per account. What each role can *see* of either is decided after
this split, not with it.

### Already per user — stays per user

| Data | Table |
| --- | --- |
| List row: status, rating, completed date, watch day, progress, `usefulness` | `user_media_list` |

`usefulness` stays per user, settled. It is used mainly on restricted media,
where in practice few accounts other than the owner's will see it, but any
user can keep their own. Its meaning is the user's to understand; nothing
documents or derives it.
| Plan queue (watch-next / read-next / rewatch, with a remark) | `plan_next` |
| Season ratings | `seasonal` |
| Novel unit ratings | `user_novel_unit_rating` |
| Game copies: storefront, ownership, format, acquisition, price paid, date, remark | `game_copy` |
| Game-choice marks: done and a note | `game_choice_mark` |
| Watch-order follows | `watch_order_follow` |
| 14 personal note sections: remark, remark list, reviews and comments, advantages, disadvantages, double-edged, personal reviews, episode comments, four todo lists, saves, questions | `note`, scope `personal` |

### Already catalogue — stays catalogue

Entries and their facts, the collection / franchise / series hierarchy,
people, studios, publishers, characters, credits, tags, options, relations,
watch orders, game choice graphs, the Resources page, quotes and memes,
images, content labels, and the 53 catalogue note sections other than the
six highlights below (plot, lore, guides, characters guide, music, endings,
mods and so on). `docs/catalogue.md` lists every section and its scope.

### Stored as catalogue but opinion-shaped — to decide

| Data | Today | Suggested |
| --- | --- | --- |
| Ratings on collections, franchises, series, characters, people, studios, publishers | `my_rating` column on the shared row — one value, the owner's | **user — settled** |
| Expectations on collections, franchises, series | `*_expectation` column on the shared row | **user — settled** |
| Novel unit remark | `remark` on the shared unit row, withheld from guests as opinion | **user — settled**, beside the unit rating |
| Highlights: `highlights`, `highlight_episodes`, `highlight_moments`, `highlight_passages`, `h_comic_highlights`, `h_game_highlights` | catalogue sections; `highlights` and `highlight_episodes` are withheld from guests as opinion, the other four are not | **user — settled.** All six become personal sections |
| Quote and meme `is_favorite` | flag on the shared row | **user — settled**, and a **granted feature** (per-account switch, off by default; today only the owner uses it) |
| `remark` on entities, credits, relations, watch orders, options | catalogue columns | **catalogue — settled**: editorial annotations |

### Notes, settled with the owner's review

- **Of the note sections, only the six highlights change scope**, to
  personal. Every other section keeps the scope `docs/catalogue.md` lists.
- **Some sections split into a catalogue row and personal fields.** The
  row — the item, enemy, ending, song, mod — stays catalogue; the fields
  below are personal:

  | Section | Personal field |
  | --- | --- |
  | 武器&裝備 Weapons & Gear, 道具 Items, 收集物 Collectibles | `collected` |
  | 敵人 Enemies | `beaten` |
  | 結局 Endings | `completion` |
  | 屬性&配點 Stats & Points | `my_value` |
  | OP, ED, 插入曲 Insert Song, OST | `status` — **granted feature** |
  | 音樂狀態 Music Status (hidden) | `status` — **granted feature** |
  | 模組&工具 Mods & Tools | `status` — **granted feature** |

  **OP/ED 變動 does not split**; it stays catalogue as it is.
- **A granted feature is personal and off by default.** Today only the
  owner uses those statuses, but there is no "me" in the system to tie them
  to, so the feature is granted to an account; an account without it does
  not see the field at all. **It is a per-account feature switch** the
  admin sets on `/users`, the same per-account shape as the access-mode
  denials — not a role. The music statuses keep their vocabulary as one
  personal field — nothing in it moves to the catalogue.
- **Proposed mechanism**, not yet confirmed: the registry marks a field
  personal; its value lives in a per-user mark on the catalogue row, the
  way `game_choice_mark` holds a user's done flag and note on a choice
  graph; a user with no mark sees the field's empty value; the migration
  moves today's values to the installation owner's marks.
- **Mixed sections: catalogue rows and personal rows together.** A section
  the registry marks as allowing it shows the catalogue rows plus the
  viewer's own personal rows, in the same groups. Personal fields
  (collected, amounts, beaten, …) work on both kinds of row, and the NG
  reset covers both.
- **Which kind an account writes is fixed by whether it writes the
  catalogue** — never both in one section:

  | Account | Writes |
  | --- | --- |
  | `user` (no `manage.catalog`) | personal rows only |
  | `super`, or anyone holding `manage.catalog` | catalogue rows only |
  | `admin` | catalogue rows only — it keeps no personal data |

  There is no "only me" switch. The owner is the one creating catalogue
  data, and the feature exists for the other users, whose catalogue is far
  from complete. A `super` that needs personal rows of its own is dealt with
  if it ever happens.
- **A user's rows sit after the catalogue rows within each group**,
  reorderable among themselves; sharing the catalogue order would mean a
  per-user copy of it.
- **A personal row is never promoted.** A request asks for it to be added
  to the catalogue.
- **The mixed sections:** 武器&裝備 Weapons & Gear, 道具 Items, 收集物
  Collectibles, 敵人 Enemies, 角色 Characters, 地理 Geography, 配裝&流派
  Builds & Styles, 隊伍組成 Team Composition, 攻略資源 Guide Resources, and
  Resources — which is on every type and group, not only games. Builds &
  Styles and Team Composition are placed by this: a guide's builds are
  catalogue rows, a user's own are personal rows.

### Game notes and other note changes

The note changes that are not about accounts — new sections, new fields,
common options, the restricted types' reviews — are their own work, in
`2026-11-12-notes-rework-design.md` beside this file. What they make
personal is settled here and listed below; that spec only points back.

- **Personal, from the notes rework:** the amount collected (beside
  `collected`), the NG reset button (it clears only the user's own
  collected status, amount collected and `beaten`), and the 下周目目標
  subsection of NG 多周目, a personal section.

**Ratings, settled: every personal rating is personal, and only external
scores are catalogue.** Every `my_rating` — on the list row, a season, a
novel unit, the three group tiers, characters, people, studios and
publishers — belongs to a user. What stays on the catalogue is a score
someone else published: `mal_rating` and `mal_rank`, `anilist_rating`,
`imdb_rating` and `imdb_series_rating`, `metacritic_score` and
`metacritic_user_score`. **Every expectation is personal** as well.

**Quotes, memes and the site-wide Resources page stay catalogue**, but who
sees them is narrower than the rest of the catalogue: quotes and memes are
to be hidden from every account but the owner's, controllable per account,
and `/resources` is likely the owner's alone. Both belong to "who can see
what", below.

**The split is complete**: every item above is settled.

**If data moves to a user**, today's values move to the installation owner's
account in the migration, and Backup and Pull carry them per user from then
on, as they do the list.

**The proposed rule for anything added later:** if two people could disagree
about it and both be right, it belongs to a user; if it is a fact about the
work, it belongs to the catalogue.

## Who can see what

**Under discussion.** Ships as `docs/authorization.md` (the technical
rules) and a plain-language summary in `docs/account.md`.

**Who sees what comes first; how each viewer's pages look comes after.**
The UI changes are not only hiding things: guests, shared accounts and the
admin may get a different dashboard and layout. That customisation is
discussed per viewer once visibility is settled.

- **A shared account is a guest that can view more** — not only through its
  higher mode, but more pages and features than a logged-out guest. **It
  keeps no data of its own**: no list, ratings, progress, personal notes or
  personal rows. Its only write is requests and reports.

### Admin

- **The admin administers and does nothing else.** No libraries, no entry,
  group, entity or search pages, no quotes, memes or `/resources`, no
  content modes, and no personal data, its own or anyone's. The owner's
  catalogue and data live on a `super` account (`cg1618`), so nothing is
  lost.
- **What it does reach:**
  - accounts — creating `user` / `super`, invites, approvals, reset codes,
    disabling, passwords, feature switches, mode ceilings and per-account
    restrictions;
  - roles' and access modes' adjustable settings, and the read-only label
    reference;
  - **announcements**;
  - **the Note pages** — System Options, Alias Conversion, External APIs;
  - **every pipeline page** — `/system`, `/data-history`, `/review-queue`,
    `/clean-orphans`, `/business-logic`;
  - **`/images`**.
- **It stops being a root role.** Today `is_root` passes every permission
  check, including ones added later. The admin becomes an ordinary role
  with a fixed set of permissions, so a later feature reaches it only by
  decision.
- **Why:** the most powerful login exposes the least, the rules lose their
  carve-outs ("everything except personal data"), and an admin with its own
  pages is a small set to design. The cost — the admin cannot see what a
  restriction does — is covered by the label reference's counts; a
  "preview as an account or mode" feature is the remedy if that is ever
  not enough, and is not built until then.
- **Still to settle:** which requests and reports the admin handles —
  discussed with requests, next.

## Open questions

1. **Who can see what** — next. Includes quotes and memes per account, the
   `/resources` page, what guests and shared accounts read, fixed vs
   adjustable settings per role and per mode, and per-account detail
   settings.
2. Still to discuss: admin and guest layouts; optimising the labels.
