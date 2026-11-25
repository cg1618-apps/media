// Frontend: one step of a followed order, drawn on one compact line.
//
// Shared by the entry page's FollowedOrderPanel and the dashboard's
// FollowedOrders, so a step reads the same in both: the entry linked by name,
// its range, its importance, the part it sits in, and its note beneath. On the
// entry page each step also carries the follower's skip toggle.
import { Link } from "react-router-dom";

import { entityPath } from "../../lib/entityPath";
import { Chip, eyebrowCls } from "../ui/primitives";
import { rangeLabel } from "./OrderGuide";
import SkipToggle from "./SkipToggle";

/**
 * The step's rung as a chip. Every rung is shown - in these compact views the
 * chip is how a follower tells an Essential next step from an Optional one -
 * but only the two that ask for attention are drawn in ink.
 */
export function ImportanceChip({ importance }) {
  if (!importance) return null;
  const loud = importance === "Essential" || importance === "Recommended";
  return <Chip tone={loud ? "ink" : "muted"}>{importance}</Chip>;
}

/**
 * `step` is an OrderFollowStep from the API. `label` is the mono caption
 * leading the line ("Next", "Now"); an empty string keeps the caption's
 * column without a word, so a run of rows lines up under one label.
 * `showNote` draws the step's note. `listId`, when given, adds the skip
 * toggle for the order it names.
 */
export default function FollowedStep({ step, label, showNote = true, listId }) {
  if (!step) return null;
  const range = rangeLabel(step);
  const name = step.display_name || "Untitled entry";
  const path = entityPath(step.media_type, step);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {label != null && (
          <span className="font-mono text-[10px] text-text-faint w-10 shrink-0">
            {label}
          </span>
        )}
        <span className="font-mono text-[10px] text-text-faint tabular-nums">
          {step.number}.
        </span>
        {path ? (
          <Link
            to={path}
            className="text-sm text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition"
          >
            {name}
          </Link>
        ) : (
          <span className="text-sm text-text">{name}</span>
        )}
        {range && (
          <span className="font-mono text-[11px] text-text-muted">{range}</span>
        )}
        <ImportanceChip importance={step.importance} />
        {step.section_name && (
          <span className={eyebrowCls}>
            {step.section_name}
          </span>
        )}
        <SkipToggle listId={listId} step={step} className="ml-auto self-center" />
      </div>
      {showNote && step.note && (
        <p className={`text-xs text-text-muted mt-0.5 ${label != null ? "pl-12" : ""}`}>
          {step.note}
        </p>
      )}
    </div>
  );
}
