# What each viewer sees

Last verified: 2026-11-14

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
| Search | — | ✓ | switch, on | switch, off | switch, off |
| Future Releases | — | ✓ | ✓ | ✓ | ✓ |
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

¹ its catalogue version: catalogue filters only, drawn unweighted. ² the
catalogue version, without personal data.

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
- **It is an ordinary role with a fixed set of permissions** — no role is
  root, and nothing passes every check. A later feature reaches the admin
  only by decision. It holds no mode, so even a route that forgot a check
  shows it no catalogue row.
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
- **The Note pages, `/images`, and every pipeline** — its Pull skips the
  account tabs, so keeping Backup and Pull here costs no
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
  Super always holds them; the admin holds none.

## Search, Track and Explore pages

| Page | guest | shared | user | super |
| --- | --- | --- | --- | --- |
| Search | switch, off | switch, off | switch, on | ✓ |
| Future Releases | ✓ | ✓ | ✓ | ✓ |
| Seasonal | ✓ | ✓ | ✓ | ✓ |
| Statistics | ✓ | ✓ | ✓ | ✓ |
| Random Picker | — | ✓ ¹ | ✓ | ✓ |
| Plan | — | — | ✓ | ✓ |
| Completions | — | — | ✓ | ✓ |

The admin has none of them: it reads no catalogue. Search asks
`view.search`, a switch on each role: fixed on for super, seeded on for
user and seeded off for guest and shared. Seasonal, Statistics and
Future Releases ask for any ordinary media type, so every viewer that reads
the catalogue has them; a viewer without a list — guest and shared — gets
each in its catalogue version. The Random Picker asks `view.random_picker`,
fixed on for super, user and shared and off for guest. Plan and Completions
ask `self.list`.

¹ Shared accounts get the Random Picker's catalogue version; see
[Random Picker and Future Releases](#random-picker-and-future-releases).

## Guest

The logged-out visitor.

- **Reads** the libraries, entry and group pages, watch orders, the
  dashboard's announcements, broadcast schedule and library links, Future
  Releases, Seasonal and Statistics (each in its catalogue version, without
  personal data), and Search and the entity kinds where its role's switches
  open them (Search is seeded off).
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
  `borderline`), plus the **Random Picker** in its catalogue version and
  **recently added** entries on the dashboard. **Never quotes or memes**,
  not even by switch.
- **Entity pages are off by default**, as for a guest; the `shared` role's
  switches are set separately from the guest's.
- **Keeps no data of its own**: no list, ratings, progress, personal notes
  or personal rows. **Its only write is requests and reports**, whose
  status it sees.
- **Nothing else beyond guest**; the rest of the difference is the
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
| **Extras** | Quotes, Memes, Resources ┃ Relations, Watch Orders | Resources | Resources, Relations, Watch Orders; quotes and memes by switch | quotes and memes by switch | — | — |
| Entry | catalogue editing, Picker Defaults, Images | Images | ✓ | — | — | — |
| Note | System Options, Alias Conversion, External APIs, Content Labels, Business Logic | ✓ | ✓ | — | — | — |
| **System** | Control Center, Data History, Review Queue, Clean Orphans, Inbox | ✓ | ✓ | — | — | — |
| Admin | Users, Roles, Access Modes | ✓ | — | — | — | — |

- **Track** holds the account's own progress — Plan and Completions.
  **Explore** holds the browsing pages — Seasonal, Future Releases, Random
  Picker and Statistics. **Extras** holds quotes, memes and resources and,
  after a rule, super's Relations and Watch Orders editors.
- **A tab with nothing left in it is not drawn.**
- **Requests sits in the header's account strip**, beside sign out, for
  shared, user and super, opening My requests — the same place for every
  filer. **Settings** sits beside it for user and super. The inbox sits
  under System, for super and the admin alike.
- **The admin's header** carries only its own tabs — Extras with Resources
  alone, Entry with Images alone, Note, System and Admin. No Library,
  Restricted, Track or Explore, and no search box.
- **The mode switcher** appears only for an account that can use more than
  one mode - a ceiling above `safe` - so never for a shared account.

### Libraries

- **super, user:** essentially the same page — every filter, sort and
  column, the personal ones holding the viewer's own status, progress,
  rating, usefulness and ownership. The status button and the plan-flag
  checkboxes work for both, since they write the viewer's own list
  (`/api/me`).
- **guest, shared:** **the catalogue parts only.** No personal filter, sort
  or column at all — not empty ones. Cards show the external score and no
  status.
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
| **super** | catalogue information; its own rating and expectation of the group; the entries' list status as its own; personal and catalogue notes; edit controls; Report a problem | the watch order, the follow toggle, a link to the Watch Orders editor |
| **user** | the same without edit controls | the watch order, the follow toggle |
| **guest** | catalogue only — no rating, expectation or list status | the watch order only |
| **shared** | the guest's page, plus Report a problem | the watch order only |
| **admin** | none | none |

A watch order, or a relations graph, whose owning collection, franchise or
series the viewer's mode hides reads as missing wherever it would be listed
— the group's page, the watch order page, the dashboard's followed orders.

### Seasonal and Statistics

| Viewer | Seasonal | Statistics |
| --- | --- | --- |
| **super, user** | the season's anime grouped by the viewer's own status, its own season rating, and its own episode steppers | its own ratings, favourites and counts, from its own list |
| **guest, shared** | the season's anime **without a status split** — what aired or airs that season, best external score first — and the All Seasons table, each season with its count of entries | **counts of the catalogue**, not anyone's opinion: entries per type, per anime season and per genre, over what the viewer's role and mode show |
| **admin** | none | none |

### Random Picker and Future Releases

| Viewer | Random Picker | Future Releases |
| --- | --- | --- |
| **super, user** | every filter, the personal ones included — status, my rating, ownership, usefulness, expectation — the weighted draw and its Weights tab | upcoming releases ordered by the viewer's own status and franchise expectation, with **On your list** and **Planned** markers |
| **shared** | **its catalogue version, catalogue filters only** — media type, genre, release decade, external score, and each type's catalogue library filters — drawn unweighted, with no Weights tab | upcoming releases, catalogue only, in release-date order |
| **guest** | none | upcoming releases, catalogue only, in release-date order |
| **admin** | none | none |

### My requests, the inbox, and pending registrations

| Page | Who | General version |
| --- | --- | --- |
| **My requests** — from the header | shared, user, super | the account's own requests — kind, target, description, remark, status; filing a new one; editing an open one. A shared account's requests are seen by everyone using that login |
| **Request and report inbox** | admin and super, under System | every request, opening on the open ones, with a filter for done and declined; marking one done or declined with a remark; deleting one by hand, with a confirmation |
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
| **super** | announcements, the broadcast schedule, its own tracker, and a **summary of pending registrations and open requests and reports**: counts and the fewest words that say what waits. Open requests link to the inbox; registrations read as waiting for the admin, unlinked, since only the admin approves them. Not the admin's inbox. **Hidden entirely when nothing waits.** |
| **user** | announcements, the broadcast schedule, its own tracker |
| **guest** | announcements, the broadcast schedule, and **a way into each library** — the header's own Library and Restricted rows |
| **shared** | the guest's dashboard, plus **recently added**: the newest entries across every type it may see |
| **admin** | its own page: the same summary of pending registrations and open requests, shown even when nothing waits and linking to the pending-registrations panel and the inbox; the latest pipeline runs; and announcements to edit. No catalogue |

The tracker is the viewer's own watch schedule, Coming Next, followed watch
orders and the Watching, Reading and Playing divisions.

