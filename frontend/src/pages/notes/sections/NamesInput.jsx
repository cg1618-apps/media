// Frontend: the input for a structured section's `names` field - several
// free-text names, with suggestions.
//
// The value is a list of strings, never ids (app/utils/note_sections.py,
// FIELD_NAMES): a highlight names the characters it is about, and a name that
// matches no character row is still a name. So the suggestions - the display
// names of the characters cast on this entry - are a convenience, not a
// vocabulary: Enter (or a comma) takes whatever was typed, unless ArrowUp /
// ArrowDown has highlighted a suggestion, which Enter then takes. The list is
// the shared SuggestList (components/forms/SuggestList.jsx).
import { useId, useRef, useState } from "react";

import { SuggestItem, SuggestList, stepActive } from "../../../components/forms/SuggestList";
import { inputCls, tagCls } from "./ui";

const MAX_SUGGESTIONS = 8;

export default function NamesInput({ label, value = [], onChange, suggestions = [] }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef(null);

  const chosen = new Set(value);
  const query = text.trim().toLowerCase();
  const offered = [...new Set(suggestions)]
    .filter((name) => name && !chosen.has(name))
    .filter((name) => !query || name.toLowerCase().includes(query))
    .slice(0, MAX_SUGGESTIONS);

  const add = (raw) => {
    const name = String(raw || "").trim();
    setText("");
    setActive(-1);
    if (!name || chosen.has(name)) return;
    onChange([...value, name]);
  };
  const remove = (name) => onChange(value.filter((n) => n !== name));

  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">{label}</p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((name) => (
            <span key={name} className={`${tagCls} gap-1 normal-case tracking-normal`}>
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                aria-label={`Remove ${name}`}
                className="text-text-faint hover:text-danger"
              >
                <i className="fas fa-times text-[8px]"></i>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          value={text}
          aria-label={label}
          role="combobox"
          aria-expanded={open && offered.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 && active < offered.length ? `${listId}-${active}` : undefined
          }
          placeholder={`Add ${label.toLowerCase()}…`}
          onChange={(e) => {
            const next = e.target.value;
            // A comma ends a name, the way a tag input usually reads it.
            if (next.includes(",")) {
              const parts = next.split(",");
              const rest = parts.pop();
              const names = parts.map((p) => p.trim()).filter(Boolean);
              const merged = [...value];
              for (const n of names) if (!merged.includes(n)) merged.push(n);
              if (merged.length !== value.length) onChange(merged);
              setText(rest);
            } else {
              setText(next);
            }
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((c) => stepActive(c, e.key === "ArrowDown" ? 1 : -1, offered.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(active >= 0 && offered[active] ? offered[active] : text);
            } else if (e.key === "Backspace" && !text && value.length) {
              remove(value[value.length - 1]);
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Typed but not confirmed still counts: leaving the field is the
            // most natural way to finish typing a name.
            add(text);
            setOpen(false);
            setActive(-1);
          }}
          className={inputCls}
        />
        {open && offered.length > 0 && (
          <SuggestList anchorRef={inputRef} id={listId} label={`${label} suggestions`}>
            {offered.map((name, index) => (
              <SuggestItem
                key={name}
                id={`${listId}-${index}`}
                active={index === active}
                // Picks on mousedown: the input's blur would otherwise add
                // the half-typed text before the choice lands.
                onPick={() => add(name)}
                onHover={() => setActive(index)}
              >
                {name}
              </SuggestItem>
            ))}
          </SuggestList>
        )}
      </div>
    </div>
  );
}
