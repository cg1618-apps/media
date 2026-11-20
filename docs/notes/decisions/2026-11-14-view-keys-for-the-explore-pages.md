# The Random Picker and Statistics get keys of their own

- **`view.random_picker`**: the picker is `super`'s, `user`'s and `shared`'s and
  never the guest's, and no existing key drew that line — `self.list` is exactly
  what a shared account lacks. It is locked per role, so the line is the
  design's, not an editor's. The plan-marks read inside the picker asks
  `self.list` rather than "signed in", because a shared account is signed in
  and keeps no plan.
- **`view.statistics`**, locked the same way, because opening on any ordinary
  media type reached the guest.
- **A key naming several unrelated pages is retired.** `view.extras` gated three
  pages that each had a better question of its own: the picker its key; Future
  Releases any ordinary media type, since it reads nothing but the catalogue;
  Completions `self.list`, since it is built from the viewer's own
  completions.
- **A key minted later is locked off for the admin already**, because the
  admin's lock is its fixed set; a test asserts it.
- **Statistics' catalogue sections show for every holder**, a member seeing them
  after its own sections, so the page reads the same for a shared account and a
  member.
- **Franchises per type are counted from the visible entries**, not from
  `franchise.franchise_type`, a free comma-joined string that does not map onto
  the media types and knows nothing about visibility.
- **Score distributions are bucketed by the server per type and pooled by the
  page**, and the scored types are read off the models rather than listed.
