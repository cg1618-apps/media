# What each viewer sees

Last verified: 2026-11-13

## What this is for

Who sees which pages and features, and how a page differs between viewers.
A **viewer** is whoever is making a request — the word the code uses too.
There are five: the **admin**, **super**, a **user**, a **guest** (signed
out) and a **shared** account (one login several people use).

How access is enforced — permissions, guards, the role and mode matrices,
the tests — is [authorization.md](authorization.md). How to sign in,
register and recover an account is [account.md](account.md); what is the
catalogue and what is an account's own data is
[catalogue.md](catalogue.md).

> **Not available yet.** Everything on this page below this note is the
> decided design of the account and authorization rework
> ([to-do-next.md](to-do-next.md), item 2), not today's behaviour. Today
> there are four viewers — `admin`, `super`, `user` and the signed-out
> guest — and what each can do is
> [authorization.md](authorization.md), "What each role can DO". Each part
> of this page becomes true when the change that builds it lands, and that
> change rewrites it in the present tense.

## At a glance

The sections below are the detail; this table summarises them.
"switch" is a per-role setting the admin adjusts, with its default after
it; "per account" is a per-account feature switch, off by default.

| | admin | super | user | guest | shared |
| --- | --- | --- | --- | --- | --- |
| Media and group libraries, detail pages, watch orders | — | ✓ | ✓ | ✓ | ✓ |
| The nine ordinary media types | — | ✓ | switch, on | switch, on | switch, on |
| H-Comic, H-Game, Hentai | — | in `unrestricted` | in `unrestricted` | never | never |
| Studio, publisher, person, character pages | — | ✓ | switch, off | switch, off | switch, off |
| Search, Future Releases | — | ✓ | ✓ | ✓ | ✓ |
| Seasonal, Statistics | — | ✓ | ✓ | ✓ ² | ✓ ² |
| Random Picker | — | ✓ | ✓ | — | ✓ ¹ |
| Plan, Completions | — | ✓ | ✓ | — | — |
| Quotes, memes | — | per account | per account | — | — |
| `/resources` | ✓ | ✓ | — | — | — |
| Content (modes) | none | up to ceiling | up to ceiling | `safe`, fixed | its own mode, fixed |
| Own personal data | — | ✓ | ✓ | — | — |
| Rows in mixed sections | — | catalogue | personal | — | — |
| Granted features | — | per account | per account | — | — |
| Requests and reports | inbox | inbox, files | files | — | files |
| Writes the catalogue | — | ✓ | never | — | — |
| Announcements, Note pages, `/images`, pipelines | ✓ | ✓ | — | — | — |
| Accounts, roles, modes | ✓ | — | — | — | — |
| Label reference | ✓ | ✓ | — | — | — |
| Anyone else's personal data | — | — | — | — | — |

¹ a customised version. ² a version without personal data, still to
design.

## Admin

- **The admin administers and does nothing else.** No libraries, no entry,
  group, entity or search pages, no quotes or memes, no
  content modes, and no personal data, its own or anyone's. The owner's
  catalogue and data live on a `super` account (`cg1618`), so nothing is
  lost.
- **What it does reach:**
  - accounts — creating `user` / `super`, invites, approvals, reset links,
    disabling, passwords, feature switches, mode ceilings and per-account
    restrictions;
  - roles' and access modes' adjustable settings, and the read-only label
    reference;
  - **announcements**;
  - **the Note pages** — System Options, Alias Conversion, External APIs;
  - **every pipeline page** — `/system`, `/data-history`, `/review-queue`,
    `/clean-orphans`, `/business-logic`;
  - **`/images`**;
  - **`/resources`** — the site-wide Resources page is admin's and super's
    alone.
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

## Super

The catalogue account — in practice the owner's, `cg1618`.

- **Reads the whole catalogue** — libraries, entries, groups, entities,
  search, the random picker, future releases, completions — up to its mode
  ceiling.
- **Quotes and memes** only through a per-account switch.
- **`/resources`**, always — it is admin's and super's alone.
- **Writes the catalogue**: entries, groups, people, credits, relations,
  watch orders, catalogue notes, images, options, announcements, and
  attaching labels. In mixed sections it writes catalogue rows only.
- **The Note pages, `/images`, and every pipeline**, as today — its Pull
  still skips the account tabs, so keeping Backup and Pull here costs no
  safety and saves switching logins.
- **The read-only label reference**, since super is the one attaching
  labels.
- **The request and report inbox.**
- **Its own personal data** — list, plan, seasonal, statistics, ratings,
  expectations, highlights, personal notes, progress on catalogue rows —
  and granted features through per-account switches.
- **Not:** accounts, roles, access modes, or anyone else's personal data.

## User

Super without the catalogue work.

- **Reads the catalogue** — libraries, entries, groups, entities, search,
  the random picker, future releases, completions — up to its mode ceiling
  (`normal` for a new account).
- **Quotes and memes** only through a per-account switch, off by default.
  **Never `/resources`.**
- **Its own personal data** — list, plan, seasonal, statistics, ratings,
  expectations, highlights, personal notes, progress on catalogue rows —
  and **personal rows** in mixed sections; granted features through
  per-account switches.
- **Files requests and reports** and sees their status; changes its own
  password; switches modes within its ceiling.
- **Never writes the catalogue.** `manage.catalog` is not grantable to a
  `user`: writing the catalogue is what makes an account `super`, which
  keeps "a user writes personal rows, super writes catalogue rows" exact.
- **Not:** pipelines, the inbox, the Note pages, `/images`, editing
  announcements, the label reference, accounts, roles, modes, or anyone
  else's personal data.

## Entity pages, shown per kind

- **Each kind of non-media, non-group library and detail page is shown or
  hidden on its own**, not as one block. Today `view.entities` opens or
  closes studios, publishers, people, seiyuu, characters and identities
  together; it splits into one setting per kind. Where a kind is hidden,
  its names render as plain text, as entity names do for a guest today.
- **Four kinds, one setting each:** studio; publisher; person — the people
  library and the seiyuu library, since a seiyuu opens a person page; and
  character — characters and identities.
- **They apply to guest, shared and user**, adjustable per role, and are
  **off by default for all three**. Super is always on; the admin is
  always off.

## Track and Insights pages

| Page | guest | shared | user | super |
| --- | --- | --- | --- | --- |
| Search | ✓ | ✓ | ✓ | ✓ |
| Future Releases | ✓ | ✓ | ✓ | ✓ |
| Seasonal | ✓ | ✓ | ✓ | ✓ |
| Statistics | ✓ | ✓ | ✓ | ✓ |
| Random Picker | — | ✓ ¹ | ✓ | ✓ |
| Plan | — | — | ✓ | ✓ |
| Completions | — | — | ✓ | ✓ |

The admin has none of them: it reads no catalogue.

¹ Shared accounts get a Random Picker that differs from today's; see
[Customised pages](#customised-pages).

**Seasonal and Statistics need a version without personal data.** Both are
built from the viewer's own list today — Seasonal sorts a season's anime
into Completed / Watching / Planned / Might Watch / Dropped by the viewer's
status, and Statistics counts the viewer's ratings and favourites. A guest
or shared account has no list, so as built both pages would be empty for
them. What those two pages show an account without data is in
[Customised pages](#customised-pages).

## Guest

The logged-out visitor.

- **Reads** the libraries, entry and group pages, watch orders, the
  dashboard's announcements and broadcast schedule, Search, Future
  Releases, Seasonal and Statistics (in a version without personal data),
  and the entity kinds its role's switches open.
- **Every media type, games included**, in `safe`. The empty Games library
  is an accident of the seed — the guest role was seeded before games
  existed — not a decision.
- **Not:** Random Picker, Plan, Completions, quotes, memes, `/resources`,
  personal data, requests.
- **No register link** on the sign-in page: an invite arrives as a link.
- Its mode is `safe`, always, fixed.

## Shared

A guest that can view more, with no data of its own.

- **Reads** everything a guest reads, in its own fixed mode (`normal` or
  `borderline`), plus a **Random Picker** in a customised version. **Never
  quotes or memes**, not even by switch.
- **Entity pages are off by default**, as for a guest; the `shared` role's
  switches are set separately from the guest's.
- **Keeps no data of its own**: no list, ratings, progress, personal notes
  or personal rows. **Its only write is requests and reports**, whose
  status it sees.
- **Nothing else beyond guest for now**; the rest of the difference is the
  per-viewer customisation in [Customised pages](#customised-pages).
- Only the admin changes its password.

## Requests and reports

- **Who files:** shared accounts, users and super. Not guests, not the
  admin.
- **Kinds:** new entry request, data error report, **incomplete data
  report**, bug report, other / suggestion.
- **A request has** a kind, an optional target (the entry, group or entity
  page it was filed from, or a page address for a bug), a description and an
  optional remark. A "Report a problem" button on entry, group and entity
  pages fills the target in; a general form covers the rest.
- **One inbox** for every kind, read by the admin and by super.
- **Status:** open, then done or declined. **The filer sees the status** of
  their own requests and nobody else's; a shared account's requests are
  seen by everyone using that login.
- **After sending, the filer can edit the content — description and
  remark — while the request is open, but cannot delete it.** Editing locks
  once it is done or declined, so a status never applies to text the
  handler did not see.
- **Nothing is removed automatically.** The inbox opens on open requests;
  a filter shows done and declined ones, which stay stored — the filer
  keeps the answer, and a declined request with its remark is the record
  of why. Space is no reason: a request is a few lines of text.
- **Admin and super can delete a request by hand**, with a confirmation —
  for spam, abuse, or something nobody should see; the filer then no longer
  sees it either. A duplicate is declined with a remark naming the original
  instead, so the filer gets an answer.
- **Requesting something the filer's mode hides is allowed.**
- **Limits are set per account** by the admin.

## Customised pages

Beyond being shown or hidden, many pages and features differ by viewer —
the admin, guests and shared accounts may get their own dashboard and
layout. **Still to design**; each page gets a section here as it is
decided. Still open:

- **Seasonal** and **Statistics** — need a version for an account without
  personal data (guest, shared).
- **Random Picker** — shared accounts get a version that differs from
  today's.

### Dashboard (`/`)

| Viewer | Shows |
| --- | --- |
| **super** | announcements, the broadcast schedule, its own tracker, and a **summary of pending registrations and open requests and reports**: counts and the fewest words that say what waits, linking to where it is handled. Not the admin's inbox. **Hidden entirely when nothing waits.** |
| **user** | announcements, the broadcast schedule, its own tracker |
| **guest** | announcements, the broadcast schedule, and **a way into each library** |
| **shared** | the guest's dashboard, plus **recently added** entries |
| **admin** | its own page: pending registrations, open requests and reports, recent pipeline runs, and announcements to edit; no catalogue |

