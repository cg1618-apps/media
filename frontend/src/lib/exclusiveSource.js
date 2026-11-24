// The exclusive source of an anime or anime movie, and the rule tying it to
// the sources: the platform an entry is exclusive to must be one of its Main
// Sources, marked Available. The server enforces the same rule
// (app/services/domain/sources.py, exclusive_source_problem); this is the
// form's copy, so the problem shows before anything is sent.

// The form's value as the one name it holds, or "" when blank. undefined while
// the form has not loaded it (Modify, before the credits GET resolves).
export function exclusiveSourceValue(form) {
  const raw = form?.exclusive_source;
  if (raw === undefined) return undefined;
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return list.map((s) => String(s).trim()).find(Boolean) || "";
}

// Why the form cannot be saved as it stands, or null.
export function exclusiveSourceProblem(form) {
  const name = exclusiveSourceValue(form);
  if (!name) return null;
  const backed = (form.sources || []).some(
    (row) =>
      (row.kind || "access") === "access" &&
      row.bucket === "main" &&
      (row.name || "").trim() === name &&
      row.available === true,
  );
  return backed
    ? null
    : `Exclusive source ${name} needs a ${name} row under Main Sources marked Available.`;
}
