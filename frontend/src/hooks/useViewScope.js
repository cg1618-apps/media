// Frontend: which of the member-only reading surfaces this viewer may see.
//
// The view.* keys open what a guest is not shown: the credited entities, one
// key per kind (studio, publisher, person - which covers seiyuu - and
// character, which covers identities), search and the Random Picker. super
// holds them all; user holds what its role grants; shared holds the picker;
// guest and admin hold none.
// A personal note section needs no key: every viewer is served it, holding
// only its own rows.
//
// `ownData` is the viewer's own opinion of catalogue rows - its rating of a
// group or an entity, its expectation of a tier, its remark on an entry or a
// group, a novel unit's remark. Those are kept per account and written under
// self.list, so they are drawn for a holder of self.list; anyone else has
// none, and the server answers null.
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
    randomPicker: has("view.random_picker"),
    ownData: has("self.list"),
  };
}
