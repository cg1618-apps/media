# Anime: JP and TW dates, a TV runtime band, remakes, lettered specials

- **An anime has a JP and a TW release date, and its season is the JP
  airing's.** `release_season`, Seasonal and `?airing_season=` read the year of
  `release_date_jp`.
- **MAL fills both dates, except on a Movie.** For a TV series the Taiwanese
  simulcast lands on the Japanese date, so copying it is right far more often
  than leaving TW blank; a movie's Taiwanese theatrical release is a date MAL
  does not know. The entry's own `airing_type` decides, not MAL's.
- **MAL runtimes from 22 to 26 minutes are stored as 24** (`TV_EPISODE_BAND`,
  autofill only). MAL lists the same half-hour slot anywhere in that band, so
  storing it verbatim makes series of the same length read as different;
  checked against real records, normal TV series sat inside it and none just
  outside. **A `Movie` skips it**: a film's length is its own.
- **A TV show's airing type is `TV` or `Special`, default `TV`.**
- **`original_or_remake` is its own column, never empty.** Anime's `is_main`
  already answers 本傳 / 外傳 / 前傳 / 後傳, so folding Remake into it would
  mix two questions; `originality` already means 原版 / 同人 on the gated
  types. An anime that says nothing is the original (NOT NULL, default
  `Original`), so a write of null is a 422 rather than a silent `Original`.
  It joins the duplicate key, since a remake usually shares its original's
  name, and auto-fill does not copy it, since a remake is usually filled from
  its original.
- **`ep_special` is text**, because specials are numbered `17.5A` and `17.5B`.
  One rule makes a value canonical wherever it arrives
  (`app/utils/ep_special.py`): a plain number in its shortest form, anything
  else trimmed as typed, blank as NULL — otherwise `17` and `17.0` would be two
  values to the duplicate key. Nothing sorts it; a future sort would have to
  order by leading number, then suffix.
