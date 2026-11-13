// Frontend: the checks a NEW password passes before it is sent.
//
// The server is authoritative (app/services/security.py,
// validate_new_password) and these mirror it only so the form can say what
// is wrong before a round trip. By the owner's decision there is no policy:
// no minimum length and no composition rules. The two checks are technical -
// an empty string is no credential, and bcrypt reads only the first 72 bytes.
// Bytes, not characters: a character outside basic Latin is two to four bytes
// in UTF-8. Do not add a rule here that the server does not have.
export const MAX_PASSWORD_BYTES = 72;

// The message for what is wrong with a new password typed twice, or null.
export function newPasswordProblem(password, again) {
  if (!password) return "A password cannot be empty.";
  const size = new TextEncoder().encode(password).length;
  if (size > MAX_PASSWORD_BYTES) {
    return (
      `A password can be at most ${MAX_PASSWORD_BYTES} bytes; this one is ` +
      `${size}. Letters outside basic Latin take two to four bytes each.`
    );
  }
  if (password !== again) return "The two new passwords do not match.";
  return null;
}
