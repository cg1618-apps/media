// Hour figures on the game and h-game detail pages.

/** "32.5 h", or null when there is no readable figure. */
export function hours(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${n} h` : null;
}

const TIME_TO_BEAT = [
  ["Main", "hltb_main"],
  ["Main + Extra", "hltb_main_extra"],
  ["Completionist", "hltb_completionist"],
];

/**
 * The IGDB time-to-beat figures an entry has, as InfoCard fields in the order
 * Main, Main + Extra, Completionist. A figure that was never recorded gets no
 * field, so an entry with none returns [].
 */
export function timeToBeatFields(entry) {
  return TIME_TO_BEAT.map(([label, column]) => ({
    label,
    value: hours(entry?.[column]),
  })).filter(({ value }) => value != null);
}

/**
 * The time-to-beat a game's playtime is measured against, as a number, or
 * null when there is none: Main + Extra, the length of a playthrough that
 * does more than the story. An entry recorded with only the Main figure
 * falls back to it rather than losing its progress altogether.
 */
export function progressEstimate(entry) {
  for (const column of ["hltb_main_extra", "hltb_main"]) {
    const value = entry?.[column];
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
