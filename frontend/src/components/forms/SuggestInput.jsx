// Frontend: a text input that suggests as you type, over a list of strings.
//
// The free-text sibling of ComboBox (which picks an item by id): whatever is
// typed is what is kept, and the suggestions are only suggestions. It opens
// on focus and narrows with every keystroke (lib/suggest.js: prefix matches
// first, then contains; the option already typed drops out). ArrowUp /
// ArrowDown move the highlight, Enter or a press picks it, and Enter with
// nothing highlighted keeps the typed text rather than taking the first
// match. The first Escape closes the list; the next one is the caller's.
//
// Replaces the browser's <datalist>, which opened only from its triangle and
// drew a native popup that looked like no other part of the app. The list is
// the shared SuggestList, so it looks like every other dropdown here.
import { useId, useRef, useState } from "react";

import { suggest } from "../../lib/suggest";
import { SuggestItem, SuggestList, stepActive } from "./SuggestList";

export default function SuggestInput({
  value,
  onChange,
  options = [],
  onPick,
  onKeyDown,
  onFocus,
  onBlur,
  className,
  ...rest
}) {
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  const matches = suggest(options, value);
  const showing = open && matches.length > 0;

  const pick = (option) => {
    setOpen(false);
    setActive(-1);
    onChange(option);
    onPick?.(option);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((c) => stepActive(c, event.key === "ArrowDown" ? 1 : -1, matches.length));
      return;
    }
    if (event.key === "Enter" && showing && active >= 0) {
      event.preventDefault();
      pick(matches[active]);
      return;
    }
    if (event.key === "Escape" && showing) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") setOpen(false);
    onKeyDown?.(event);
  };

  return (
    <>
      <input
        ref={input}
        type="text"
        {...rest}
        value={value ?? ""}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onFocus={(event) => {
          setOpen(true);
          onFocus?.(event);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          setOpen(false);
          setActive(-1);
          onBlur?.(event);
        }}
        className={className}
      />
      {showing && (
        <SuggestList anchorRef={input} id={listId}>
          {matches.map((option, index) => (
            <SuggestItem
              key={option}
              id={`${listId}-${index}`}
              active={index === active}
              onPick={() => pick(option)}
              onHover={() => setActive(index)}
            >
              {option}
            </SuggestItem>
          ))}
        </SuggestList>
      )}
    </>
  );
}
