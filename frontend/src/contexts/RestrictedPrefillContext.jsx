// Frontend: which restricted source names each media type prefills, as picked
// on /defaults, for the editors that need it deep inside a form.
//
// The value is the form-defaults config (GET /api/form-defaults/), or any map
// of the same shape - /defaults provides its unsaved draft, so the editor there
// shows the pick being made. With no provider the built-in prefill applies
// (lib/restrictedSources.js), which is also what an unreachable config means.
import { createContext, useContext } from "react";
import { prefillPicks } from "../hooks/useFormDefaults";

const RestrictedPrefillContext = createContext({});

export function RestrictedPrefillProvider({ config, children }) {
  return (
    <RestrictedPrefillContext.Provider value={config || {}}>
      {children}
    </RestrictedPrefillContext.Provider>
  );
}

/** The picked prefill for `mediaType`, or null for the built-ins. */
export function usePrefillPicks(mediaType) {
  return prefillPicks(mediaType, useContext(RestrictedPrefillContext));
}
