// Frontend: which of the member-only reading surfaces this viewer may see.
//
// The view.* keys open what a guest is not shown: the credited entities, one
// key per kind (studio, publisher, person - which covers seiyuu - and
// character, which covers identities), search, the extras (Future Releases,
// Completions, the Random Picker, Resources) and personal content (the catalogue's own ratings and
// expectations, a novel unit's remark, the highlight note sections). super
// holds them all; user holds what its role grants; guest holds none; admin
// passes through the root flag.
//
// The server already refuses or strips what a viewer may not read. This hook
// is the UI's half: it hides the chip, column, sort option or section rather
// than drawing an empty slot for a value that will never arrive, and it
// keeps a component from asking for data it would only be refused.
//
// Outside an AuthProvider nobody is known to hold anything, so every flag is
// false.
import { useAuth } from "../contexts/AuthContext";

export function useViewScope() {
  const auth = useAuth();
  const has = (permission) => Boolean(auth?.has?.(permission));
  return {
    studio: has("view.studio"),
    publisher: has("view.publisher"),
    person: has("view.person"),
    character: has("view.character"),
    search: has("view.search"),
    extras: has("view.extras"),
    personal: has("view.personal"),
  };
}
