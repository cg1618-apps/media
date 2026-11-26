// One generic tab for every media type on the /defaults page.
//
// There is no per-type file here (unlike add-tabs/ and modify-tabs/) because
// the whole layout is driven by the field registry, which derives its keys from
// the form factories. Adding a field to a form makes it appear here for free.

import { Fragment } from "react";
import DefaultValueControl, { describeBuiltIn } from "../../components/forms/DefaultValueControl";
import { SectionHeader } from "../../components/forms/FormField";
import { getFieldGroups } from "../../config/formFields";
import { RestrictedPrefillEditor } from "../../components/forms/SourcesEditor";
import { prefillVariants } from "../../lib/restrictedSources";

// The auto-fill column's heading. One heading names the whole column, so the
// ticks under it carry no text of their own - only an accessible name.
const AUTOFILL_HEADING = "Replace when choosing an existing entry";

/**
 * The picked restricted-source prefill, one editor per variant (h-comic has
 * one per region), laid out as rows of the field grid under `sources` - whose
 * own editor on this page leaves the restricted group out.
 */
function RestrictedPrefillRows({ type, picks, setPrefill, clearPrefill, gridCls, hasAutofill }) {
  return prefillVariants(type).map((variant) => {
    const isOverridden = Array.isArray(picks?.[variant.key]);
    const label =
      variant.key === "all" ? "Restricted Prefill" : `Restricted Prefill (${variant.label})`;
    return (
      <div key={variant.key} className={`${gridCls} md:items-start`}>
        <div className="min-w-0">
          <div className="text-xs font-bold text-text-muted truncate">{label}</div>
          <div className="text-[10px] font-mono text-text-faint/60 truncate">
            restricted_prefill.{variant.key}
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <RestrictedPrefillEditor
              label="Prefilled restricted sources"
              value={isOverridden ? picks[variant.key] : variant.builtIn}
              onChange={(names) => setPrefill(variant.key, names)}
              names={variant.names}
            />
          </div>
          {isOverridden && (
            <button
              type="button"
              title={`Revert to built-in (${variant.builtIn.join(", ") || "none"})`}
              onClick={() => clearPrefill(variant.key)}
              className="text-text-faint/60 hover:text-brand shrink-0 px-1"
            >
              <i className="fas fa-undo text-xs"></i>
            </button>
          )}
        </div>
        {hasAutofill && (
          <div className="flex md:justify-center">
            <span className="text-[10px] text-text-faint/60">—</span>
          </div>
        )}
      </div>
    );
  });
}

export default function DefaultsTab({
  type,
  draft,
  setFieldDefault,
  clearFieldDefault,
  toggleAutofill,
  setGroupAutofill,
  setPrefill,
  clearPrefill,
  sources,
}) {
  const groups = getFieldGroups(type);
  const { defaults, autofill } = draft;

  // The Entity tabs (studio, person, character) have no "auto-fill from an
  // existing record" search on the Add page, so not one of their fields is
  // autofillable. Drop the column outright rather than render a row of
  // placeholder dashes beside every field.
  const hasAutofill = groups.some(({ fields }) => fields.some((f) => f.autofillable !== false));
  // Every row is a grid of its own, so the auto-fill column takes a fixed
  // width - wide enough for its two-line heading - to line up row to row.
  const columnsCls = hasAutofill
    ? "md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_8rem]"
    : "md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]";
  const gridCls = `grid grid-cols-1 gap-2 md:gap-4 ${columnsCls}`;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
      {/* Shown from md up, where the ticks form a column; below it the grid
          collapses and each tick is named by its aria-label alone. */}
      {hasAutofill && (
        <div className={`hidden md:grid md:gap-4 ${columnsCls}`}>
          <div className="md:col-start-3 text-center text-[10px] font-bold text-text-faint leading-tight">
            {AUTOFILL_HEADING}
          </div>
        </div>
      )}
      {groups.map(({ group, fields }) => {
        const autofillable = fields.filter((f) => f.autofillable !== false);
        // The group button only ever ticks: it is offered while a field in
        // the group is unticked, and unticking is per field.
        const someOff = autofillable.some((f) => !autofill.includes(f.key));

        return (
          <div key={group}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <SectionHeader icon="fa-sliders-h" title={group} />
              </div>
              {someOff && (
                <button
                  type="button"
                  title={`Replace every ${group} field when choosing an existing entry`}
                  onClick={() =>
                    setGroupAutofill(
                      autofillable.map((f) => f.key),
                      true
                    )
                  }
                  className="ml-4 mt-2 text-[10px] font-bold text-text-faint hover:text-brand whitespace-nowrap"
                >
                  Select all
                </button>
              )}
            </div>

            <div className="space-y-3">
              {fields.map((field) => {
                const isOverridden = field.key in defaults;
                // A repeater (sources, game copies) is a block of rows, not a
                // single control: it stacks under its label and takes the full
                // width instead of being squeezed into the value column.
                const isRepeater = field.control === "sources" || field.control === "copies";
                return (
                  <Fragment key={field.key}>
                    <div
                      className={`${gridCls} ${isRepeater ? "md:items-start" : "md:items-center"}`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-text-muted truncate">
                          {field.label}
                        </div>
                        <div className="text-[10px] font-mono text-text-faint/60 truncate">
                          {field.key}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <DefaultValueControl
                            field={field}
                            value={defaults[field.key]}
                            onChange={(v) => setFieldDefault(field.key, v)}
                            sources={sources}
                            mediaType={type}
                          />
                        </div>
                        {isOverridden && (
                          <button
                            type="button"
                            title={`Revert to built-in (${describeBuiltIn(field)})`}
                            onClick={() => clearFieldDefault(field.key)}
                            className="text-text-faint/60 hover:text-brand shrink-0 px-1"
                          >
                            <i className="fas fa-undo text-xs"></i>
                          </button>
                        )}
                      </div>

                      {hasAutofill && (
                        <div className="flex md:justify-center">
                          {field.autofillable === false ? (
                            <span className="text-[10px] text-text-faint/60">—</span>
                          ) : (
                            <input
                              type="checkbox"
                              aria-label={`Replace ${field.label} when choosing an existing entry`}
                              checked={autofill.includes(field.key)}
                              onChange={() => toggleAutofill(field.key)}
                              className="rounded accent-brand cursor-pointer"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    {field.key === "sources" && (
                      <RestrictedPrefillRows
                        type={type}
                        picks={draft.restricted_prefill}
                        setPrefill={setPrefill}
                        clearPrefill={clearPrefill}
                        gridCls={gridCls}
                        hasAutofill={hasAutofill}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
