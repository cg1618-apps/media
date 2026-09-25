// Frontend: statistics page file for StatsSidebar.
import { useEffect, useState } from "react";
import { STATS_SECTIONS, STATS_SECTION_IDS } from "./sections";
import { Eyebrow } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { visibleByType } from "../../lib/gatedTypes";

// Highlights whichever section is nearest the top of the viewport.
//
// An IntersectionObserver rather than a scroll listener: it reports only the
// blocks whose visibility actually changed, so the common case - scrolling
// inside one long section - costs nothing. The threshold list is what makes a
// block taller than the viewport still register.
function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const visible = new Set();
    const observer = new IntersectionObserver(
      (records) => {
        records.forEach((record) => {
          if (record.isIntersecting) visible.add(record.target.id);
          else visible.delete(record.target.id);
        });
        // Document order, not intersection-ratio order: the nearest one to
        // the top is the one being read, and a ratio comparison flickers
        // between two blocks of unequal height.
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    );
    ids
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

function SectionLink({ id, label, active, indented }) {
  return (
    <a
      href={`#${id}`}
      className={`block border-l-2 py-1 transition-colors ${
        indented ? "pl-4 text-[11px]" : "pl-3 text-xs"
      } ${
        active
          ? "border-text text-text"
          : "border-border text-text-muted hover:border-border-strong hover:text-text"
      }`}
    >
      {label}
    </a>
  );
}

export default function StatsSidebar() {
  const active = useActiveSection(STATS_SECTION_IDS);
  const auth = useAuth();

  return (
    // Hidden on narrow screens, where the page is one column and the sidebar
    // would just be a second copy of it above the content.
    <nav
      aria-label="Statistics sections"
      className="hidden lg:block w-52 shrink-0"
    >
      <div className="sticky top-24 space-y-4">
        <Eyebrow>On this page</Eyebrow>
        {STATS_SECTIONS.map((section) => (
          <div key={section.id} className="font-mono">
            <SectionLink
              id={section.id}
              label={section.label}
              active={active === section.id}
            />
            {visibleByType(auth, section.children || [], (c) => c.gatedType).map((child) => (
              <SectionLink
                key={child.id}
                id={child.id}
                label={child.label}
                active={active === child.id}
                indented
              />
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
