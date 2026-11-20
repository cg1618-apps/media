# Progress numbers are floats, and a step goes to the next integer

- **Every progress count and total is a float.** Half an episode watched, or a
  total of 12.5 for a season with a recap half-episode, is a real value, and one
  numeric type for every counter means one stepping rule. Not
  `achievements_total` (whole) and not `vol_fin_page` (a page).
- **A downgrade floors**: a partial unit is not a finished one.
- **Fill and Replace never truncate a total** (one float parser, which also
  treats `nan` / `inf` as no value).
- **+ and − go to the next integer in their direction**, not ±1: + is
  `floor(x) + 1`, − is `ceil(x) - 1`. Adding one to 2.5 gives 3.5, a value
  nobody stepping a counter means; rounding a fraction away on the first step
  was rejected because − from 2.5 should be 2, not 1. A tolerance of `1e-9`
  lets float noise step as the integer it is.
- **+ stops at the total without passing it**, a fractional total included, and
  is a no-op there; typing over the total is still refused.
- **One helper, `frontend/src/lib/progressStep.js`**, holds the rule, the
  display formatter and the field list for every stepper, so no two steppers
  step differently. Display rounds to six decimals.
