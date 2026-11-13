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
> ([to-do-next.md](to-do-next.md), item 1), not today's behaviour, except
> what is listed as built here. The five viewers exist — `admin`, `super`,
> `user`, the signed-out guest, and the two shared accounts — and what each
> role can do today is [authorization.md](authorization.md), "What each role
> can DO". Each remaining part of this page becomes true when the change that
> builds it lands, and that change rewrites it in the present tense.
>
> **Built:** [Removed](#removed), under "Customised pages";
> [Requests and reports](#requests-and-reports), and every row of
> [My requests, the inbox, and pending registrations](#my-requests-the-inbox-and-pending-registrations);
> [Entity pages, shown per kind](#entity-pages-shown-per-kind); and, in
> "At a glance", the rows for the nine ordinary media types, H-Comic, H-Game
> and Hentai, the entity pages, and quotes and memes for `super` and `user`.
> Requests and reports work for `admin`, `super`, `user` and the shared
> accounts. Quotes and memes follow a per-account switch on the Users page,
> held only by `user` and `super` accounts ([authorization.md](authorization.md),
> "Per-account feature switches"); favourites, music status and mod status
> are switches there too, which gate nothing until the personal-data work
> lands. Until the header rework, the inbox sits under Pipelines for both
> admin and super, and pending registrations are a panel on `/system`, shown
> only to the admin. Invite links are issued on `/users`. A `user` never writes the catalogue (`manage.catalog` is
> locked off for the role). The shared accounts, `shared-normal` and
> `shared-borderline`, each fixed at its own mode, keep no data of their own,
> and only the admin sets their password
> ([authorization.md](authorization.md), "Shared accounts").
>
> **Built:** the read-only label reference, for `admin` and `super` — the
> "Label reference" row of [At a glance](#at-a-glance) and its bullets under
> [Admin](#admin) and [Super](#super). `/content-labels` lists every label,
> which modes show it and how many entries, collections, franchises and series
> carry it, and sits
> under the Note section of the nav. Also built: the access modes' adjustable
> settings are a name and a description, and nothing else, because the modes
> and what each shows are code. The rest of those two sections is not built.
>
> **Built underneath, not yet as described here:** every account has a mode
> ceiling and a default, set on the Users page, and switches among the modes
> up to its ceiling ([authorization.md](authorization.md), "Access modes").
> A shared account's mode is fixed for switching too, so the mode switcher
> does not appear for it. The "Content (modes)" row is not yet true as a
> whole: `admin` still sits in `unrestricted` rather than in no mode.
>
> **The admin is still a root role**, so it still reads every page this
> design takes from it — the catalogue, the entity pages, and quotes and
> memes, which it holds without a switch.
>
> **A shared account lacks Random Picker and Future Releases** until
> `view.extras` is split. Both sit behind that one key, which also opens
> Resources and Completions — neither of them a shared account's — so it is
> locked off for `shared`; until the split a shared account reads what a
> guest reads, plus requests.

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
  hidden on its own**, not as one block. Where a kind is hidden, its library
  row and its pages are absent and its names render as plain text wherever
  they appear.
- **Four kinds, one setting each:** studio (`view.studio`); publisher
  (`view.publisher`); person (`view.person`) — the people library and the
  seiyuu library, since a seiyuu opens a person page; and character
  (`view.character`) — characters, identities, and the Characters tab on
  franchise and series pages.
- **They apply to guest, shared and user**, adjustable per role on the
  Roles page, and a fresh database starts **all three with them off**.
  Super always holds them; the admin is to hold none once it stops being a
  root role.

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
- **The nine ordinary media types, games included**, in `safe` — each a
  switch on the role, seeded on. Never H-Comic, H-Game or Hentai: those are
  fixed off for a guest.
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
- **Status:** open, then done or declined, with an optional response from
  whoever handled it. **The filer sees the status and the response** for
  their own requests, and nobody else's. A shared account's requests are
  seen by everyone using that login. A handler can set a closed request
  back to open, and the filer can then edit it again.
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
- **Limits are set per account** by the admin. A limit counts **open**
  requests at once, so a handled request frees a place. The defaults are
  `user` 15 and `shared` 10. `super` has none, and that is fixed.

## Customised pages

Beyond being shown or hidden, many pages differ by viewer. Each page gets a
section here as it is decided; the designs — how a page looks — come from
the owner, so these sections say what differs, not where it sits.

**Each page is settled here in its general version only.** The detailed
customisation per viewer — columns, defaults, layout, wording — is
discussed after the rework is built; see [open-items.md](open-items.md),
"Per-viewer page detail".

Every page listed below is settled in its general version.

### Removed

*Built — true today.*

- There are no **public profiles** (`/user/<username>`) and no **community
  card** on entry pages. Everything per user is private to its account, so
  both could only ever be empty; neither exists, rather than being hidden.

### Header and menus

| Tab | Holds | admin | super | user | guest | shared |
| --- | --- | --- | --- | --- | --- | --- |
| Library | collection, franchise, the nine types, the entity libraries whose switches are on | — | ✓ | ✓ | ✓ | ✓ |
| Restricted | H-Comic, H-Game, Hentai | — | in `unrestricted` | in `unrestricted` | — | — |
| **Track** | Plan, Completions | — | ✓ | ✓ | — | — |
| **Explore** | Seasonal, Future Releases, Random Picker, Statistics | — | ✓ | ✓ | all but Random Picker | ✓ |
| **Extras** | Quotes, Memes, Resources | Resources | ✓ | quotes and memes by switch | — | — |
| Entry, Note | catalogue editing, options | Note | ✓ | — | — | — |
| **System** (was Pipelines) | Control Center, history, review queue, … | ✓ | ✓ | — | — | — |
| Admin | users, roles, labels, modes | ✓ | — | — | — | — |

- **Three tabs replace Track and Insights.** **Track** keeps the
  account's own progress — Plan and Completions; **Explore** holds the
  browsing pages — Seasonal, Future Releases, Random Picker and
  Statistics; **Extras** is the old Insights. Super's Relations and Watch
  Orders editors stay in Extras.
- **A tab with nothing left in it is not drawn.**
- **Requests sits in the header**, beside sign out, for shared, user and
  super, opening My requests — the same place for every filer. The inbox
  sits under System for super and Admin for the admin.
- **The Pipelines tab is renamed System.**
- **The admin's header** carries only its own tabs — no Library, no search
  box.
- **The mode switcher** appears only for an account that can use more than
  one mode - a ceiling above `safe` - so never for a shared account.
- Sign in and sign out stay as they are.

### Libraries

- **super, user:** essentially the same page — every filter, sort and
  column, the personal ones holding the viewer's own status, progress,
  rating, usefulness and ownership. The status button and the plan-flag
  checkboxes work for both, since they write the viewer's own list; today
  they are gated on being the admin.
- **guest, shared:** **the catalogue parts only.** No personal filter, sort
  or column at all — not empty ones. Cards show the external score.
- **admin:** no libraries.
- The gated types' libraries follow the same split, for super and user in
  `unrestricted`.

### Entry detail pages

| Viewer | Entry page |
| --- | --- |
| **super** | catalogue information, its own My tracker card, personal notes, personal fields (collected, beaten, …), catalogue rows in mixed sections, edit controls, Report a problem |
| **user** | the same without edit controls, and **personal** rows in mixed sections |
| **guest** | catalogue only — no tracker, personal notes, personal fields or personal rows, no Report a problem; entity names as plain text where their switch is off |
| **shared** | the guest's page, plus **Report a problem** |
| **admin** | no entry pages |

Granted features — the music and mod statuses, favourites — appear only for
an account that has them switched on.

### Collection, franchise and series pages, and watch order pages

| Viewer | Collection / franchise / series page | Watch order page |
| --- | --- | --- |
| **super** | catalogue information; its own rating and expectation of the group; the entries' list status as its own; personal and catalogue notes; edit controls; Report a problem | the watch order, the follow toggle, edit controls |
| **user** | the same without edit controls | the watch order, the follow toggle |
| **guest** | catalogue only — no rating, expectation or list status | the watch order only |
| **shared** | the guest's page, plus Report a problem | the watch order only |
| **admin** | none | none |

### Seasonal and Statistics

| Viewer | Seasonal | Statistics |
| --- | --- | --- |
| **super, user** | the season's anime sorted by the viewer's own status, and its own season rating | its own ratings, favourites and counts |
| **guest, shared** | the season's anime **without a status split** — what aired or airs that season, with external scores — and the All Seasons table | **counts of the catalogue**, not anyone's opinion: entries per type, per season, per genre |
| **admin** | none | none |

### Random Picker and Future Releases

| Viewer | Random Picker | Future Releases |
| --- | --- | --- |
| **super, user** | every filter, the personal ones included — on my list, by status, planned, my rating | upcoming releases, with on-your-list and plan markers |
| **shared** | **its own version, catalogue filters only** — type, genre, season, external score | upcoming releases, catalogue only |
| **guest** | none | upcoming releases, catalogue only |
| **admin** | none | none |

### My requests, the inbox, and pending registrations

| Page | Who | General version |
| --- | --- | --- |
| **My requests** — from the header | shared, user, super | the account's own requests — kind, target, description, remark, status; filing a new one; editing an open one. A shared account's requests are seen by everyone using that login |
| **Request and report inbox** | admin (under Admin), super (under System) | every request, opening on the open ones, with a filter for done and declined; marking one done or declined with a remark; deleting one by hand, with a confirmation |
| **Pending registrations** | admin | the accounts waiting for approval; approving sets the role (default `user`) and the ceiling and default mode (`normal`) in one form; declining deletes the account |

Super's dashboard summary counts pending registrations too, though only the
admin approves them: for super it is a prompt to switch to the admin login.

### Search

**Results follow every switch that can be off.** A result group appears
only where the viewer may open what it links to: an entity kind whose
switch is off, a media type its role does not hold, anything its mode
hides — none of these return results, so search never leads to a page the
viewer cannot see.

The server leaves such a type's bucket out of the response altogether
rather than send it empty, because an empty list would still say the type
exists. People, studios, publishers and characters need `view.person`,
`view.studio`, `view.publisher` and `view.character`; each media type needs
the role's `media_type.<type>` grant, and a gated type also a mode that
shows it. Collections, franchises, series and seasons are always searched.
So `/search` draws no tab and no section for a type the viewer cannot see,
the nav search offers no scope for it, and an entity card or row whose
kind's key the viewer lacks is plain text rather than a link.

### Settings

- **user, super:** changing their own password.
- **shared, guest, admin:** no Settings page.

### Dashboard (`/`)

| Viewer | Shows |
| --- | --- |
| **super** | announcements, the broadcast schedule, its own tracker, and a **summary of pending registrations and open requests and reports**: counts and the fewest words that say what waits, linking to where it is handled. Not the admin's inbox. **Hidden entirely when nothing waits.** |
| **user** | announcements, the broadcast schedule, its own tracker |
| **guest** | announcements, the broadcast schedule, and **a way into each library** |
| **shared** | the guest's dashboard, plus **recently added** entries |
| **admin** | its own page: pending registrations, open requests and reports, recent pipeline runs, and announcements to edit; no catalogue |

