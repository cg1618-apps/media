// Anime seasons are calendar quarters: WIN is Jan–Mar, SPR Apr–Jun, SUM
// Jul–Sep, FAL Oct–Dec. The codes match the "SSS YYYY" strings stored in
// system_configs.current_season.

export const SEASON_CODES = ["WIN", "SPR", "SUM", "FAL"];

// The season after the one `date` falls in — the value an admin is usually
// about to set as the current season.
export function nextSeason(date = new Date()) {
  const index = Math.floor(date.getMonth() / 3) + 1;
  return {
    code: SEASON_CODES[index % 4],
    year: date.getFullYear() + (index === 4 ? 1 : 0),
  };
}
