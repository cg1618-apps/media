// Frontend: which of the member-only reading surfaces this viewer may see.
//
// The four view.* keys open what a guest is not shown: the credited entities,
// search, the extras (Future Releases, Completions, the Random Picker, Quotes,
// Memes, Resources) and personal content (the catalogue's own ratings and
// expectations, the community aggregate, public profiles, a novel unit's
// remark, the highlight note sections). user and super hold all four; guest
// holds none; admin passes through the root flag.
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
  };
}
