// Frontend: form component file for MultiSelect.
import { useState, useRef, useEffect, useId } from "react";

import { SuggestItem, SuggestList, SuggestNote, stepActive } from "./SuggestList";

// MultiSelect: manage a comma-separated string value using pill UI.
// Props:
//   options: string[]         — available choices (from /api/options/)
//   value: string             — current comma-separated selected values (e.g. "A-1 Pictures, Toei")
//   onChange(newValue: string)— called with updated comma-separated string
//   placeholder: string
//   limit: number | null      — max entries to show in the dropdown (default 10;
//                                pass null to show every available option)
//   max: number | null        — max values that can be SELECTED (default
//                                unlimited); picking one more replaces the
//                                oldest, so max=1 behaves as a single select
//
// The list is the shared SuggestList, anchored under the whole pill box.
// ArrowUp/ArrowDown highlight an option and Enter adds it; Enter with nothing
// highlighted adds the typed text (the matching option when one equals it).
export default function MultiSelect({
  options = [],
  value = "",
  onChange,
  placeholder = "Select...",
  limit = 10,
  max = null,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const containerRef = useRef(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const selected = value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

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

  function cleanStr(s) {
    if (!s) return "";
    return s
      .toLowerCase()
      .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
  }

  const available = options.filter((o) => !selected.includes(o));
  const cap = (arr) => (limit == null ? arr : arr.slice(0, limit));
  const filtered = query
    ? cap(available.filter((o) => cleanStr(o).includes(cleanStr(query))))
    : cap(available);

  function addValue(val) {
    const added = [...selected, val];
    const next = max == null ? added : added.slice(-max);
    onChange(next.join(", "));
    setQuery("");
    setActive(-1);
    inputRef.current?.focus();
  }

  function removeValue(val) {
    const next = selected.filter((v) => v !== val);
    onChange(next.join(", "));
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
      addValue(filtered[active]);
      return;
    }
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      const exact = available.find(
        (o) => o.toLowerCase() === query.trim().toLowerCase(),
      );
      if (exact) addValue(exact);
      else if (query.trim()) addValue(query.trim()); // allow custom entry
    }
    if (e.key === "Backspace" && !query && selected.length > 0) {
      removeValue(selected[selected.length - 1]);
    }
    if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      setQuery("");
      setActive(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Pills + input */}
      <div
        ref={boxRef}
        className="flex flex-wrap gap-1.5 w-full border border-border rounded-lg px-2 py-1.5 bg-surface cursor-text focus-within:ring-2 focus-within:ring-brand focus-within:border-transparent min-h-[38px]"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 bg-brand/10 text-brand text-xs font-bold px-2 py-0.5 rounded-full"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeValue(v);
              }}
              className="hover:text-danger transition ml-0.5"
            >
              <i className="fas fa-times text-[9px]"></i>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[4rem] text-sm font-medium outline-none bg-transparent py-0.5"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <SuggestList anchorRef={boxRef} id={listId}>
          {filtered.length === 0 ? (
            <SuggestNote>
              {query ? `Press Enter to add "${query}"` : "No more options"}
            </SuggestNote>
          ) : (
            filtered.map((opt, index) => (
              <SuggestItem
                key={opt}
                id={`${listId}-${index}`}
                active={index === active}
                onPick={() => addValue(opt)}
                onHover={() => setActive(index)}
              >
                {opt}
              </SuggestItem>
            ))
          )}
        </SuggestList>
      )}
    </div>
  );
}

