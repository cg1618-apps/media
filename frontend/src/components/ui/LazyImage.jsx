// Frontend: the one <img> the app draws.
//
// Native loading="lazy" is not enough on a long list. The browser starts an
// image once it comes within 1250-2500px of the screen and never cancels it,
// so a fast scroll through a library fires every cover it passes. Every cover
// is a gated request (app/routers/covers.py), so a hundred of them fill the
// server's workers and its database pool, and the click that follows waits
// behind them. See docs/frontend/design-system.md, rule 8.
//
// So the src is held back until the image has stayed near the screen for
// DWELL_MS, and taken away again if the image leaves before it finished
// loading, which aborts the request. An image already on screen when it
// mounts loads at once, so a detail page's cover does not wait.
//
// loading="lazy" stays as well, for the case below where there is no
// IntersectionObserver and the src is handed over straight away.
import { useEffect, useRef, useState } from "react";

export const DWELL_MS = 150;
const ROOT_MARGIN = "200px";

// Read per call, not at import, so a test can install a fake observer.
const hasObserver = () => typeof IntersectionObserver !== "undefined";

export default function LazyImage({ src, ...props }) {
  const ref = useRef(null);
  const [wanted, setWanted] = useState(() => !hasObserver());

  useEffect(() => {
    const img = ref.current;
    if (!hasObserver() || !img) return undefined;
    let timer = null;
    let first = true;
    const observer = new IntersectionObserver(
      ([record]) => {
        clearTimeout(timer);
        if (record.isIntersecting) {
          if (first) setWanted(true);
          else timer = setTimeout(() => setWanted(true), DWELL_MS);
        } else if (!img.complete) {
          // Still downloading (an <img> with no src is complete): drop it.
          setWanted(false);
        }
        first = false;
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(img);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [src]);

  return <img ref={ref} loading="lazy" src={wanted ? src : undefined} {...props} />;
}
