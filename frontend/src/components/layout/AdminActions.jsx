// The admin strip on the twelve media-type detail pages: a dashed instrument
// frame with two groups of buttons. `start` holds the editing actions (Edit,
// Autofill & update) at the left end; `end` holds the status steps (the
// release button, then Mark completed) at the right end. On a narrow screen
// the end group wraps to its own line and stays right-aligned. The page owns
// the permission gate and every handler; the strip owns only the layout.
//
// The entity pages (character, person, studio, publisher, identity), the
// three hubs and the order page draw their admin strips with it too, passing
// only `start`. `className` is the strip's outer spacing: `mb-8` under a
// detail page's header, nothing inside a hub's `space-y` column.
export default function AdminActions({ start, end = null, className = "mb-8" }) {
  return (
    <div
      className={`border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-2 items-center ${className}`}
    >
      <div role="group" aria-label="Edit actions" className="flex flex-wrap gap-2">
        {start}
      </div>
      {end && (
        <div
          role="group"
          aria-label="Status actions"
          className="flex flex-wrap gap-2 justify-end ml-auto"
        >
          {end}
        </div>
      )}
    </div>
  );
}
