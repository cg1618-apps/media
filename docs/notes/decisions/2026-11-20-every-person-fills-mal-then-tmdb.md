# Every person fills from MAL, then from TMDB through an IMDb link

A person is filled by two Fill pipelines, `person-mal` and `person-tmdb`, and
the same two run on save and on the person page's Autofill & update — MAL
first, each when its id is present, whatever role the person holds.

- **One MAL pipeline for every person, not one for seiyuu.** MAL serves
  directors, authors and seiyuu from the same people endpoint, in the same
  shape, so there is nothing the role could change about the fetch or the
  mapping. The seiyuu-only rule was a scope chosen when the fill was first
  built, with no recorded reason that depends on the role; a director with a
  MAL link was left with the link and an empty profile. Rejected: keeping a
  seiyuu pipeline and adding a second "staff" one, which would be two copies
  of one fetch differing only in a filter.
- **The person carries an IMDb link, not a TMDB link.** It matches movies, TV
  shows and cartoons, which store `imdb_link` / `imdb_id` and reach TMDB
  through `/find`; the same Find endpoint answers a name id in its
  `person_results`. An IMDb name URL is also what a person actually has to
  hand — it is the one people paste. Rejected: a `tmdb_link` column, which
  would be a second identifier convention for one external service.
- **MAL first, and TMDB only fills what is still blank.** MAL is the source
  this collection's anime side is built around, its person record is the one
  the MAL cast import links seiyuu to, and it carries a Japanese name TMDB
  does not.
  Both fills are fill-only and TMDB runs second, so a value MAL supplied is
  never replaced by TMDB's. Rejected: TMDB first, or merging the two by
  field, either of which would let a TMDB romanisation displace MAL's.
- **TMDB writes a gender only for male (2) and female (1).** The person
  vocabulary is `男` / `女` / NULL. TMDB's `0` (not specified) and `3`
  (non-binary) have no value in it, so they leave the column NULL rather than
  being forced into one of the two. The cost is that such a person keeps
  `gender` blank, stays eligible for `person-tmdb`, and is fetched again on
  each Fill run. Rejected: dropping `gender` from the eligibility check, which
  would stop a person with a known gender on TMDB from ever being filled for
  it once their name and photo are set.
