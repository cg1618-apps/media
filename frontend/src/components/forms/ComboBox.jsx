// Frontend: form component file for ComboBox.
import { useState, useRef, useEffect, useId } from "react";

import { rankByMatch } from "../../lib/suggest";
import { SuggestItem, SuggestList, SuggestNote, stepActive } from "./SuggestList";

// ComboBox: search existing items by label, or type a new value (if allowNew).
// Props:
//   items: [{id, label}]
//   selectedId: string|null   — the currently chosen existing item's ID
//   inputText: string         — text typed when no existing item is selected
//   onSelect(id, label)       — called when user picks an existing item
//   onType(text)              — called when user types (no selection)
//   onClear()                 — called when user clears selection
//   placeholder: string
//   allowNew: bool            — if true, typed unmatched text shows "Will create new" hint
//   required: bool
//   rankMatches: bool         — order what the typed text matches as exact,
//                               then prefix, then contains, each tier in the
//                               order `items` came in; otherwise matches keep
//                               the order of `items`
//
// The list is the shared SuggestList (portaled, so a modal or scroll box
// cannot clip it). ArrowUp/ArrowDown highlight a result and Enter picks it;
// Enter with nothing highlighted is left to the form.
export default function ComboBox({
  items = [],
  selectedId = null,
  inputText = "",
  onSelect,
  onType,
  onClear,
  placeholder = "Search...",
  allowNew = false,
  required = false,
  rankMatches = false,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
        setActive(-1);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedLabel = selectedId
    ? items.find((i) => i.id === selectedId)?.label || ""
    : "";

  function cleanStr(s) {
    if (!s) return "";
    return s
      .toLowerCase()
      .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
  }

  const keyOf = (i) => cleanStr(i.searchText || i.label);
  const typed = cleanStr(query);
  const filtered = (
    !typed
      ? items
      : rankMatches
        ? rankByMatch(items, typed, keyOf)
        : items.filter((i) => keyOf(i).includes(typed))
  ).slice(0, 10);

  const isNewValue = allowNew && inputText && !selectedId;

  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    setActive(-1);
    onType?.(val);
    if (selectedId) onClear?.(); // typing clears any existing selection
  }

  function handleSelect(item) {
    onSelect?.(item.id, item.label);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function handleClear(e) {
    e.stopPropagation();
    onClear?.();
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((c) => stepActive(c, e.key === "ArrowDown" ? 1 : -1, filtered.length));
      return;
    }
    if (e.key === "Enter" && open && active >= 0 && filtered[active]) {
      e.preventDefault();
      handleSelect(filtered[active]);
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      setQuery("");
      setActive(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Display: selected item OR text input */}
      {selectedId ? (
        <div className="flex items-center gap-2 w-full border border-brand/40 rounded-lg px-3 py-2 bg-brand-soft">
          <i className="fas fa-check-circle text-brand text-xs shrink-0"></i>
          <span className="text-sm font-bold text-text flex-1 truncate">
            {selectedLabel}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-text-faint hover:text-danger transition shrink-0"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query || inputText}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            placeholder={placeholder}
            required={required && !selectedId && !inputText}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            autoComplete="off"
          />
          {(query || inputText) && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-2.5 text-text-faint hover:text-text-muted"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && !selectedId && (
        <SuggestList anchorRef={inputRef} id={listId}>
          {filtered.length === 0 ? (
            <SuggestNote>
              {allowNew && query
                ? `"${query}" — will be created as new`
                : "No matches found"}
            </SuggestNote>
          ) : (
            filtered.map((item, index) => (
              <SuggestItem
                key={item.id}
                id={`${listId}-${index}`}
                active={index === active}
                onPick={() => handleSelect(item)}
                onHover={() => setActive(index)}
              >
                {item.label}
              </SuggestItem>
            ))
          )}
        </SuggestList>
      )}

      {/* "Will create new" hint */}
      {isNewValue && !open && (
        <p className="text-[10px] text-warning font-bold mt-0.5 flex items-center gap-1">
          <i className="fas fa-magic"></i> Will create new record on save
        </p>
      )}
    </div>
  );
}

