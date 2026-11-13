// Frontend: which of the member-only reading surfaces this viewer may see.
//
// The four view.* keys open what a guest is not shown: the credited entities,
// search, the extras (Future Releases, Completions, the Random Picker, Quotes,
// Memes, Resources) and the highlight note sections (view.personal). user and
// super hold all four; guest holds none; admin passes through the root flag.
//
// `ownData` is the viewer's own opinion of catalogue rows - its rating of a
// group or an entity, its expectation of a tier, a novel unit's remark. Those
// are kept per account and written under self.list, so they are drawn for a
// holder of self.list; anyone else has none, and the server answers null.
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
    entities: has("view.entities"),
    search: has("view.search"),
    extras: has("view.extras"),
    personal: has("view.personal"),
    ownData: has("self.list"),
  };
}
