# To do next

Last verified: 2026-11-13

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

## 1. Account and authorization rework

Users, roles, access modes, content labels and authentication together,
including what becomes personal: per-user ratings, expectations,
highlights, personal fields on catalogue rows, mixed sections, granted
features, and the personal half of the notes rework — the amount
collected, the NG reset button, 下周目目標 — whose design is
[superpowers/specs/2026-11-12-notes-rework-design.md](superpowers/specs/2026-11-12-notes-rework-design.md).
**The design is complete.**
What each viewer sees is [viewers.md](viewers.md).

Design: [superpowers/specs/2026-11-03-account-system-design.md](superpowers/specs/2026-11-03-account-system-design.md).

Until it lands, sessions are a flat 30 days with no revocation and there is
no password reset — an admin sets one at `/users`.
