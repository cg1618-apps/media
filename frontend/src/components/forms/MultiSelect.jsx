// Frontend: form component file for MultiSelect.
import { useState, useRef, useEffect, useId } from "react";

import { isEnterKey, useEnterSubmitGuard } from "../../hooks/useEnterToAdd";
import { rankByMatch } from "../../lib/suggest";
import {
  SuggestAction,
  SuggestItem,
  SuggestList,
  SuggestNote,
  stepActive,
} from "./SuggestList";

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
//   idleOptions: string[]     — what an empty box offers (default: options);
//                                typing always searches all of `options`
//
// Typed text is matched exact, then prefix, then contains (lib/suggest.js's
// rankByMatch), each tier keeping the order `options` came in - so a list
// given most-used first stays that way inside each tier.
//
// The list is the shared SuggestList, anchored under the whole pill box.
// ArrowUp/ArrowDown highlight an option and Enter adds it; Enter with nothing
// highlighted adds the typed text (the matching option when one equals it).
// While text is typed that no option equals, the list ends with an
// `Add "<text>"` row, so a value that is not in the vocabulary yet can be
// added by a tap - on a phone keyboard Enter is not always readable
// (hooks/useEnterToAdd.js). Leaving the field does not add the text: a stray
// tap away would otherwise mint a vocabulary value nobody meant.
export default function MultiSelect({
  options = [],
  value = "",
  onChange,
  placeholder = "Select...",
  limit = 10,
  max = null,
  idleOptions,
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
    ? cap(rankByMatch(available, cleanStr(query), cleanStr))
    : cap((idleOptions ?? options).filter((o) => !selected.includes(o)));

  const typedText = query.trim();
  const typedKey = typedText.toLowerCase();
  const exactOption = available.find((o) => o.toLowerCase() === typedKey);
  // The add row: typed text that is neither an option nor already held.
  const offerAdd =
    typedText !== "" &&
    !exactOption &&
    !selected.some((v) => v.toLowerCase() === typedKey);
  const rowCount = filtered.length + (offerAdd ? 1 : 0);

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

  // Enter with nothing highlighted: the matching option, else the typed
  // text as a custom value. False when there is nothing typed to add.
  function addTyped() {
    if (!typedText) return false;
    addValue(exactOption || typedText);
    return true;
  }

  useEnterSubmitGuard(inputRef, addTyped);

  function handleKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((c) => stepActive(c, e.key === "ArrowDown" ? 1 : -1, rowCount));
      return;
    }
    const enter = isEnterKey(e);
    if (enter && open && active >= 0 && filtered[active]) {
      e.preventDefault();
      addValue(filtered[active]);
      return;
    }
    if (enter && typedText) {
      e.preventDefault();
      addTyped();
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
          enterKeyHint="enter"
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[4rem] text-sm font-medium outline-none bg-transparent py-0.5"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <SuggestList anchorRef={boxRef} id={listId}>
          {rowCount === 0 && <SuggestNote>No more options</SuggestNote>}
          {filtered.map((opt, index) => (
            <SuggestItem
              key={opt}
              id={`${listId}-${index}`}
              active={index === active}
              onPick={() => addValue(opt)}
              onHover={() => setActive(index)}
            >
              {opt}
            </SuggestItem>
          ))}
          {offerAdd && (
            <SuggestItem
              id={`${listId}-${filtered.length}`}
              active={active === filtered.length}
              onPick={() => addValue(typedText)}
              onHover={() => setActive(filtered.length)}
            >
              <SuggestAction icon="fa-plus">{`Add "${typedText}"`}</SuggestAction>
            </SuggestItem>
          )}
        </SuggestList>
      )}
    </div>
  );
}

