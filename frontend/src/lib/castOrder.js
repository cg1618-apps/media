// Frontend: the one order a cast is shown in.
//
// Castings in CHARACTER_ROLES order (Main, Core, Supporting, Other), then the
// saved position; a casting with no role sorts last rather than crowding the
// top (castRoleRank). The detail page's cast slip shows a cast this way, and
// the cast editor takes a loaded cast in the same order, so what the admin
// arranges is what the page shows.
import { castRoleRank } from "../config/fieldOptions";

export function sortCast(cast) {
  return [...(cast || [])].sort((a, b) => {
    const ra = castRoleRank(a.role);
    const rb = castRoleRank(b.role);
    if (ra !== rb) return ra - rb;
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

// A cast loaded into the editor: sorted as above, and renumbered so position
// is the order shown, which is the order the next save writes.
export function orderLoadedCast(cast) {
  return sortCast(cast).map((row, k) => ({ ...row, position: k }));
}

// An identity row is one cast as one of its character's other identities:
// loaded with an identity_id, or added by the cast editor's "+ Identity"
// (which marks it identity_row until an identity is picked).
export function isIdentityRow(row) {
  return Boolean(row?.identity_row || row?.identity_id);
}

export const MISSING_IDENTITY_MESSAGE = "Pick or create an identity";

// Why a cast cannot be saved as it stands, or null: an identity row with no
// identity picked would otherwise save as a second main row of its character.
export function castIdentityProblem(cast) {
  const missing = (cast || []).some(
    (row) => row?.character_id && isIdentityRow(row) && !row.identity_id,
  );
  return missing
    ? `${MISSING_IDENTITY_MESSAGE} on every identity row in the cast, or remove the row.`
    : null;
}
