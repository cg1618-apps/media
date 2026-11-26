# The random picker draws one type, or franchises, never every type at once

- **No mode over every type.** The general mode could only filter on what all
  types share, so it offered none of the filters that make a pick useful - a
  type's own status vocabulary, its scores, its genres - and its media-type
  chips duplicated the mode strip. The strip opens on Franchise, which is the
  one mode that does span the types.
- **A shared account gets every mode, minus the personal filters.** It used to
  have one cut-down picker with two filters. Every filter already carries
  `personal: true` when it reads a list, so dropping exactly those defs gives a
  shared account the catalogue half of the same page; a second, hand-chosen
  filter set was a second thing to keep in step for no reason.
- **One layout per type, stated in the picker, not inherited from the
  library.** The library's order puts the tag filters in a collapsed advanced
  section, which suits browsing a list; the picker wants one fixed order across
  types (source, type, region, status columns, decade, scores, my values, plan
  marks, genres), so every type reads the same. `PICKER_LAYOUTS` names each key
  and throws on one that resolves to nothing, so a renamed library def cannot
  silently drop out of the picker.
- **Stopped is its own status group, not a pause weighed as progress.** Paused
  and Temp Dropped are set aside to come back to: neither in progress nor given
  up. They group as Stopped in every status filter and weigh 0.3 in the draw,
  below Completed and above Dropped (0.1). The earlier regrouping of Temp
  Dropped as In Progress is gone with it.
