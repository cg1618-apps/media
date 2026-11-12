# To do next

Last verified: 2026-11-12

**Decided work that is not built yet, in the order it is to be built.** An
item here has been settled with the owner — what to build is known — but
nobody has started it. Unmade decisions and known defects are
[open-items.md](open-items.md) instead.

Like that page, there is **no status column, no claiming and no
lifecycle**. Work starts by cutting a branch, and an item is closed by
deleting it in the same change that builds it; the commit and the pull
request are the record. If the order changes, the list is reordered.

Each item is a short statement and a pointer. The detail lives in the
design it points at — under `superpowers/specs/` while it is being built —
and the present-tense pages take over once it ships.

## 1. Notes rework — the catalogue half

New and changed note sections that need nothing from the account work:
common options as suggestion lists with their own tab, optional grouping
for 攻略資源 Guide Resources, the `collected` option and the amount total on
the collected sections, the NG Reset field, the 地理 Geography section,
quick move in 待辦 Todo, and the restricted types' 評論 Reviews and Comments
replaced by 大眾評價 Public Reviews and 我的評價 Personal Reviews.

Design: [superpowers/specs/2026-11-12-notes-rework-design.md](superpowers/specs/2026-11-12-notes-rework-design.md).

Its personal half — the amount collected, the NG reset button, 下周目目標 —
waits for item 2.

## 2. Account and authorization rework

Users, roles, access modes, content labels and authentication together,
including what becomes personal: per-user ratings, expectations,
highlights, personal fields on catalogue rows, mixed sections, granted
features, and the personal half of item 1. **The design is not finished**:
who can see what is still being decided, and nothing is built until the
design has no open questions.

Design: [superpowers/specs/2026-11-03-account-system-design.md](superpowers/specs/2026-11-03-account-system-design.md).

Until it lands, sessions are a flat 30 days with no revocation and there is
no password reset — an admin sets one at `/users`.

**Prerequisite inside it:** `Note`, `Meme` and `Quote` must carry their
author by username on the Sheets tabs before a second person writes a note
— see [open-items.md](open-items.md), "authorship does not round-trip".
