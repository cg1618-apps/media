// Frontend: modal component file for ReleaseDetailsModal.
//
// Opened by MarkReleaseButton on the release step, listing only the release
// details the entry is still missing (lib/releaseAction.js,
// releaseDetailFields). Every field is optional: Confirm writes the status
// change plus whatever was filled in, and a blank field is left as it was.
// Laid out like MarkAiringModal so the two read as one family.
import { useState } from "react";
import { Button } from "../ui/primitives";
import { Field, selectCls } from "../forms/FormField";
import ReleaseDateInput from "../forms/ReleaseDateInput";
import { WEEKDAYS } from "../../config/weekdays";
import { broadcastTimeOptions } from "../../config/broadcastTimes";
import { isValidReleaseDate } from "../../lib/releaseDate";

function DetailInput({ spec, value, onChange }) {
  if (spec.kind === "date") {
    return <ReleaseDateInput label={spec.label} value={value} onChange={onChange} />;
  }
  const options = spec.kind === "time" ? broadcastTimeOptions(value) : WEEKDAYS;
  return (
    <Field label={spec.label}>
      <select
        className={selectCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function ReleaseDetailsModal({
  title,
  heading,
  fields,
  onConfirm,
  onCancel,
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map(({ field }) => [field, ""])),
  );
  const invalid = fields.some(
    ({ field, kind }) => kind === "date" && !isValidReleaseDate(values[field]),
  );

  function confirm() {
    const filled = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== ""),
    );
    onConfirm(filled);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="bg-surface border border-border shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            {heading}
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-muted">
            "<span className="font-semibold text-text">{title}</span>" is
            missing these details. Fill in any you know; blanks stay empty.
          </p>
          {fields.map((spec) => (
            <DetailInput
              key={spec.field}
              spec={spec}
              value={values[spec.field]}
              onChange={(v) => setValues((prev) => ({ ...prev, [spec.field]: v }))}
            />
          ))}
        </div>
        <div className="px-6 pb-5 flex flex-col gap-2">
          <Button kind="primary" onClick={confirm} disabled={invalid}>
            {heading}
          </Button>
          <Button kind="ghost" size="sm" className="mt-1" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
