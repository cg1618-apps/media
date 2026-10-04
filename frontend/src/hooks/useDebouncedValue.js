// Frontend: a value that follows its input only once the input stops changing.
//
// The app debounces typed search at 250 ms (useGlobalMediaSearch, Images,
// ImagePicker); this is that same delay as a hook, for a component whose
// query should run on what the admin settled on rather than every keystroke.
import { useEffect, useState } from "react";

export const SEARCH_DEBOUNCE_MS = 250;

export function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
