# The random picker draws a status group first, then an entry

- **Weighted by default, in two stages.** One product of weights per entry
  (status × rating × plan mark × decade × serialization) makes each
  in-progress entry likelier than each completed one, but not in-progress
  picks likelier than completed picks: a group's share is its weight times its
  head count, so thirty entries in progress at 1.5 lose to six hundred
  completed at ~0.75, ten to one. So the status group is drawn first, in fixed
  proportions among the groups the pool holds, and the other factors choose
  inside it. The shares stay put as the library grows.
- **Rating orders Completed only.** A completed S must not outrank anything in
  progress on rating; in two stages that holds by construction, because the
  rating factor never leaves its group.
- **Where the weighting regroups a status.** Statuses that wait on a release
  weigh like a "might", since a pick that
  cannot be started yet is no more use. Won't Watch shares Dropped's weight
  rather than being excluded, so a pool filtered to it can still be drawn from.
- **Group plan marks are read, not just entry flags.** Some types plan
  rewatches only at franchise scope, so entry flags alone would give them no
  rewatch weight; the page reads the viewer's plan rows, one request shared
  with the Plan page's cache.
- **The weights are constants in code, not settings.** An editor for them was
  considered and not built: the tables are small, and the Weights tab renders
  them straight from `lib/pickerWeights.js`, so the page cannot disagree with
  the draw. Only the per-mode on/off travels.
