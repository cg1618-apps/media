// Frontend: the site's primary navigation.
//
// Two rows, read as a catalog drawer:
//   1. an ink identity row — the mark, the universal search, the session
//   2. a paper tab strip — one index tab per section, where the tab you are
//      inside loses its bottom edge and opens into the page below it
//
// Every link comes from `config/navigation.js`; the desktop strip and the
// mobile drawer render the same tree, so there is one place to edit.
//
// Below lg the tab strip gives way to a drawer, and below sm the ink row keeps
// only the mark, a search button and the menu button - everything else
// (access mode, theme, back up, log out) moves into the drawer's footer, where
// a phone has the width to show it. A phone has no room for the search slot
// either, so the search button opens it as a full-width row under the bar.
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import ModeSwitcher from "./ModeSwitcher";
import { hardNavigate } from "../../lib/hardNavigate";
import { useAuth } from "../../contexts/AuthContext";
import { canSeeGatedType } from "../../lib/gatedTypes";
import { useTheme } from "../../contexts/ThemeContext";
import { useToast } from "../../hooks/useToast";
import {
  NAV_SECTIONS,
  visibleSections,
  activeItem,
  activeSectionKey,
} from "../../config/navigation";
import NavSearch from "./NavSearch";

// Placeholder entries route to the holding page instead of their own.
function itemHref(item) {
  return item.dev ? "/under-development" : item.to;
}

// One row inside an open panel. Text only - the label is the link. `roomy`
// is the drawer's size: a finger needs a taller row than a pointer does.
function PanelLink({ item, current, onNavigate, roomy = false }) {
  if (item.divider) {
    return <div className="border-t border-border my-1.5" role="separator" />;
  }
  return (
    <Link
      to={itemHref(item)}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      title={item.dev ? "Under development" : undefined}
      className={`flex items-center px-2.5 ${roomy ? "py-2.5" : "py-1.5"} text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        item.dev
          ? "text-text-faint hover:bg-surface-2"
          : current
            ? "bg-brand-soft text-brand font-semibold"
            : "text-text hover:bg-surface-2 hover:text-brand"
      }`}
    >
      {item.label}
    </Link>
  );
}

// A section's panel: a single list, or the library's three labelled columns.
function SectionPanel({ section, currentItem, onNavigate }) {
  if (section.columns) {
    return (
      <div className="flex gap-6 p-3">
        {section.columns.map((col) => (
          <div key={col.heading} className="min-w-[9.5rem]">
            <div className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              {col.heading}
            </div>
            <div className="space-y-0.5">
              {col.items.map((item) => (
                <PanelLink
                  key={item.label}
                  item={item}
                  current={item === currentItem}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="p-2 space-y-0.5 min-w-[12rem]">
      {section.items.map((item, i) => (
        <PanelLink
          key={item.label ?? `divider-${i}`}
          item={item}
          current={item === currentItem}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// Icon-only control on the ink row.
const INK_ICON_BTN =
  "px-2 py-1.5 text-ink-text/60 hover:text-ink-text hover:bg-ink-text/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

// Text row in the mobile drawer.
const DRAWER_ROW =
  "flex w-full items-center px-2.5 py-2.5 text-sm text-text hover:bg-surface-2 transition";

// The drawer's body for one section. Library's columns become labelled
// two-up grids, so its links take half the rows a single list would.
function DrawerSection({ section, currentItem, onNavigate }) {
  if (section.columns) {
    return section.columns.map((col) => (
      <div key={col.heading} className="pb-1">
        <div className="px-2.5 pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
          {col.heading}
        </div>
        <div className="grid grid-cols-2 gap-x-2">
          {col.items.map((item) => (
            <PanelLink
              key={item.label}
              item={item}
              current={item === currentItem}
              onNavigate={onNavigate}
              roomy
            />
          ))}
        </div>
      </div>
    ));
  }
  return (
    <div className="space-y-0.5">
      {section.items.map((item, i) => (
        <PanelLink
          key={item.label ?? `divider-${i}`}
          item={item}
          current={item === currentItem}
          onNavigate={onNavigate}
          roomy
        />
      ))}
    </div>
  );
}

export default function Nav() {
  const { theme, toggle: toggleTheme } = useTheme();
  const auth = useAuth();
  const { isAdmin, has, username, role } = auth;
  const { showToast } = useToast();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Which drawer sections are unfolded. Opening the drawer resets it to the
  // section the reader is in, so the links they most likely want are the
  // ones already showing and the rest fold down to one row each.
  const [expanded, setExpanded] = useState(() => new Set());
  const [openKey, setOpenKey] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const stripRef = useRef(null);
  const triggerRefs = useRef({});

  const sections = visibleSections(NAV_SECTIONS, has, (type) =>
    canSeeGatedType(auth, type),
  );
  const currentSection = activeSectionKey(location.pathname);
  const currentItem = activeItem(location.pathname)?.item ?? null;

  // Any route change closes whatever was open.
  useEffect(() => {
    setOpenKey(null);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  // The drawer covers the page, so the page must not scroll behind it: on a
  // phone a swipe that reaches the end of the drawer would otherwise carry on
  // into the page underneath. Growing past lg hides the drawer, so it closes
  // then too rather than leaving the page locked behind something unseen.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const wide = window.matchMedia?.("(min-width: 64rem)");
    const onWide = (e) => e.matches && setMobileOpen(false);
    wide?.addEventListener?.("change", onWide);
    return () => {
      document.body.style.overflow = previous;
      wide?.removeEventListener?.("change", onWide);
    };
  }, [mobileOpen]);

  function toggleDrawer() {
    if (!mobileOpen) {
      setExpanded(new Set(currentSection ? [currentSection] : []));
      setSearchOpen(false);
    }
    setMobileOpen((o) => !o);
  }

  function toggleSearch() {
    if (!searchOpen) setMobileOpen(false);
    setSearchOpen((o) => !o);
  }

  function toggleSection(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Clicking away from the strip closes the open panel.
  useEffect(() => {
    if (!openKey) return;
    function handler(e) {
      if (stripRef.current && !stripRef.current.contains(e.target)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openKey]);

  // Escape closes and hands focus back to the tab that opened the panel;
  // the arrow keys walk the links inside it.
  function handleStripKeyDown(e) {
    if (e.key === "Escape" && openKey) {
      e.stopPropagation();
      const trigger = triggerRefs.current[openKey];
      setOpenKey(null);
      trigger?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const panel = stripRef.current?.querySelector("[data-nav-panel]");
    if (!panel) return;
    const links = [...panel.querySelectorAll("a")];
    if (links.length === 0) return;
    e.preventDefault();
    const at = links.indexOf(document.activeElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = at === -1 ? (step === 1 ? 0 : links.length - 1) : at + step;
    links[(next + links.length) % links.length].focus();
  }

  async function handleBackup() {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const res = await fetch("/api/data-control/backup", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        showToast("success", "Backup completed");
      } else {
        showToast("error", "Backup failed");
      }
    } catch {
      showToast("error", "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  // Signing out is a FULL page load of the page we are on, not a route
  // change. Swapping the auth snapshot leaves every answer React Query
  // cached for the outgoing account in place, and `staleTime` serves those
  // again without asking the server - so the dashboard of the person who
  // just signed out keeps rendering to a guest. ProtectedRoute sorts out
  // where a guest may actually stand once the page comes back.
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    hardNavigate(location.pathname + location.search);
  }

  // On /login itself the next ProtectedRoute already put in the query string
  // IS the destination. Rebuilding the link around the current location there
  // would nest the login page inside its own next, and Login has no
  // already-signed-in bounce - so a visitor who was sent here from a protected
  // page and clicked this button instead of filling in the form would sign in
  // and land straight back on this form.
  const loginHref =
    location.pathname === "/login"
      ? `/login${location.search}`
      : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <nav className="sticky top-0 z-50">
      {/* Row 1 — the drawer front */}
      <div className="bg-ink text-ink-text">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <Link
              to="/"
              className="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="font-mono text-base tracking-[0.14em] text-ink-text">
                CG1618
              </span>
            </Link>

            <NavSearch />

            <div className="flex items-center gap-2 shrink-0">
              {/* The role CHIP is a capability and stays gated; the name
                  beside it is an identity and is not. Three states, one
                  strip: a guest reads "Guest", any signed-in account reads
                  its username and gets a way out.

                  It prints the ROLE, never a fixed word. `isAdmin` is
                  has(manage.catalog), which `super` holds as well as
                  `admin`, so a chip hard-coding "Admin" labels a super
                  account with the wrong role - and the two are exactly what
                  this chip exists to tell apart. */}
              {isAdmin && (
                <span
                  title="Your role"
                  className="hidden sm:inline-flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-text/60 border border-ink-text/30 px-1.5 py-0.5"
                >
                  {role}
                </span>
              )}
              {/* A username is a VALUE, so it keeps the body face and its own
                  casing - the mono uppercase treatment belongs to labels. */}
              <span
                className="hidden sm:inline-flex items-center text-xs text-ink-text/80 max-w-[10rem] truncate"
                title={username ? `Signed in as ${username}` : "Not signed in"}
              >
                {username ?? "Guest"}
              </span>
              {isAdmin && has("manage.pipelines") && (
                <button
                  type="button"
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="hidden md:inline-flex items-center bg-brand hover:bg-brand-hover px-3 py-1.5 text-xs font-medium text-on-brand transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text/60"
                >
                  {backingUp ? "Backing up…" : "Back up"}
                </button>
              )}
              {username ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Log out"
                  aria-label="Log out"
                  className={`hidden sm:inline-block ${INK_ICON_BTN} hover:text-danger`}
                >
                  <i className="fas fa-sign-out-alt text-sm"></i>
                </button>
              ) : (
                <Link
                  to={loginHref}
                  className="inline-flex items-center border border-ink-text/40 hover:border-ink-text px-3 py-1.5 text-xs font-medium text-ink-text transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Log in
                </Link>
              )}

              {/* Renders itself only when this account holds more than one
                  access mode, and reads no permission - every signed-in
                  account holds one, and gating it would hide it from the
                  `user` role that most needs to narrow itself. */}
              <div className="hidden sm:block">
                <ModeSwitcher />
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={theme === "dark"}
                className={`hidden sm:inline-block ${INK_ICON_BTN}`}
              >
                <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"} text-sm`}></i>
              </button>

              <button
                type="button"
                onClick={toggleSearch}
                aria-expanded={searchOpen}
                aria-label="Search"
                className={`md:hidden px-3 py-2.5 ${INK_ICON_BTN}`}
              >
                <i className={`fas ${searchOpen ? "fa-xmark" : "fa-search"}`}></i>
              </button>

              <button
                type="button"
                onClick={toggleDrawer}
                aria-expanded={mobileOpen}
                aria-label="Toggle navigation"
                className={`lg:hidden px-3 py-2.5 ${INK_ICON_BTN}`}
              >
                <i className={`fas ${mobileOpen ? "fa-xmark" : "fa-bars"}`}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Phone search - an overlay under the bar rather than a row of it, so
          the nav keeps its --nav-h height and sticky page headers do not
          jump when it opens. */}
      {searchOpen && (
        <div
          className="md:hidden absolute inset-x-0 top-full bg-ink px-4 pb-3 pt-1 shadow-lg"
          onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
        >
          <NavSearch variant="sheet" onDone={() => setSearchOpen(false)} />
        </div>
      )}

      {/* Row 2 — the index tabs. The active tab drops its bottom edge and
          merges into the page canvas below. */}
      <div
        ref={stripRef}
        onKeyDown={handleStripKeyDown}
        className="hidden lg:block bg-surface border-b border-border"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end gap-1">
            {sections.map((section) => {
              const isCurrent = section.key === currentSection;
              const isOpen = section.key === openKey;
              return (
                <div key={section.key} className="relative">
                  <button
                    type="button"
                    ref={(el) => (triggerRefs.current[section.key] = el)}
                    onClick={() =>
                      setOpenKey((k) => (k === section.key ? null : section.key))
                    }
                    aria-expanded={isOpen}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`relative -mb-px flex h-10 items-center border px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${
                      isCurrent
                        ? "border-border border-b-canvas bg-canvas text-text"
                        : isOpen
                          ? "border-transparent text-text"
                          : "border-transparent text-text-muted hover:text-text"
                    }`}
                  >
                    {/* The brand cap marks the drawer you have open. */}
                    {isCurrent && (
                      <span className="absolute inset-x-0 top-0 h-0.5 bg-brand"></span>
                    )}
                    {section.label}
                  </button>

                  {isOpen && (
                    <div
                      data-nav-panel
                      className="absolute left-0 top-full mt-px z-50 bg-surface border border-border shadow-xl"
                    >
                      <SectionPanel
                        section={section}
                        currentItem={currentItem}
                        onNavigate={() => setOpenKey(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile drawer — same tree, one fold per section. It fills the
          screen under the bar and scrolls on its own, so every section is
          reachable however long the tree is. */}
      {mobileOpen && (
        <div
          data-nav-drawer
          className="lg:hidden fixed inset-x-0 top-14 bottom-0 bg-surface border-t border-border overflow-y-auto overscroll-contain"
        >
          <div className="px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {sections.map((section) => {
              const isOpen = expanded.has(section.key);
              const isCurrent = section.key === currentSection;
              return (
                <div key={section.key} className="border-b border-border">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between px-2.5 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition ${
                      isCurrent ? "text-brand" : "text-text-muted hover:text-text"
                    }`}
                  >
                    {section.label}
                    <i
                      className={`fas fa-chevron-down text-[10px] transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    ></i>
                  </button>
                  {isOpen && (
                    <div className="pb-2">
                      <DrawerSection
                        section={section}
                        currentItem={currentItem}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-3">
              {/* The same three states as the desktop strip, and the theme
                  toggle sits outside them: reading the site in the dark is
                  not an administrative act. */}
              <div className="flex items-center gap-2 px-2.5 pb-2">
                <span className="text-sm text-text-muted truncate">
                  {username ?? "Guest"}
                </span>
                {isAdmin && (
                  <span
                    title="Your role"
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint border border-border px-1.5 py-0.5"
                  >
                    {role}
                  </span>
                )}
              </div>

              <div className="px-2.5 pb-2">
                <ModeSwitcher id="access-mode-drawer" />
              </div>

              <button type="button" onClick={toggleTheme} className={DRAWER_ROW}>
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>

              {isAdmin && has("manage.pipelines") && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    handleBackup();
                  }}
                  className={DRAWER_ROW}
                >
                  Back up data
                </button>
              )}

              {username ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  className="flex w-full items-center px-2.5 py-2 text-sm text-danger hover:bg-danger/10 transition"
                >
                  Log out
                </button>
              ) : (
                <Link
                  to={loginHref}
                  onClick={() => setMobileOpen(false)}
                  className={DRAWER_ROW}
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
