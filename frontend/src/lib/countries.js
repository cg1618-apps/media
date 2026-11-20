// Frontend: a studio's countries between the API and the form.
//
// The API holds a list (`countries`, null when none is known). The form holds
// it as comma-separated text, the shape every tags field's state takes, so
// MultiSelect edits it and a saved default on /defaults is plain text.

/** The names in a form value, trimmed, blanks and repeats dropped. */
export function splitCountries(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? "").split(",")) {
    const name = raw.trim();
    const key = name.toLocaleLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** The form value for a stored list (or null). */
export function countriesToForm(countries) {
  return (countries || []).join(", ");
}

/** The list a save posts: the form's names, or null when there are none. */
export function countriesPayload(text) {
  const names = splitCountries(text);
  return names.length ? names : null;
}

/** The names a page shows, joined for one line; "" when none is known. */
export function formatCountries(countries) {
  return (countries || []).join(", ");
}
