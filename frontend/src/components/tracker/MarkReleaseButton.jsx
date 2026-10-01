// Frontend: the admin toolbar's release button, shared by every media detail
// page. What it says and what it writes come from lib/releaseAction.js; the
// write itself goes through the page's own optimistic PATCH helper, passed in
// as `onPatch(payload, toast)`. Renders nothing when the entry has no next
// release step.
//
// The release step first opens ReleaseDetailsModal for whichever release
// details the entry is still missing; with none missing it writes at once,
// as the finishing step always does.
import { useState } from "react";
import { Button } from "../ui/primitives";
import ReleaseDetailsModal from "../modals/ReleaseDetailsModal";
import { releaseAction, releaseDetailFields } from "../../lib/releaseAction";

export default function MarkReleaseButton({ type, entry, title, onPatch }) {
  const [asking, setAsking] = useState(false);
  const action = releaseAction(type, entry);
  if (!action) return null;
  const fields = action.ask ? releaseDetailFields(type, entry) : [];

  return (
    <>
      <Button
        onClick={() =>
          fields.length > 0
            ? setAsking(true)
            : onPatch(action.payload, action.toast)
        }
      >
        {action.label}
      </Button>
      {asking && (
        <ReleaseDetailsModal
          title={title}
          heading={action.label}
          fields={fields}
          onConfirm={(details) => {
            setAsking(false);
            onPatch({ ...details, ...action.payload }, action.toast);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
