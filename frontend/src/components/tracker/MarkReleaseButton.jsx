// Frontend: the admin toolbar's release button, shared by every media detail
// page. What it says and what it writes come from lib/releaseAction.js; the
// write itself goes through the page's own optimistic helper, passed in as
// `onPatch(payload, toast)`, which sends the release to the catalogue PATCH
// and any of the viewer's own fields in it (RELEASE_PERSONAL_FIELDS) through
// /api/me. Renders nothing when the entry has no next release step.
//
// `canTrack` is self.list. Without it the step carries none of the viewer's
// own fields: no status move, and no "My watch day" in the dialog.
//
// The release step first opens ReleaseDetailsModal for whichever release
// details the entry is still missing; with none missing it writes at once,
// as the finishing step always does.
import { useState } from "react";
import { Button } from "../ui/primitives";
import ReleaseDetailsModal from "../modals/ReleaseDetailsModal";
import { releaseAction, releaseDetailFields } from "../../lib/releaseAction";

export default function MarkReleaseButton({ type, entry, title, onPatch, canTrack = true }) {
  const [asking, setAsking] = useState(false);
  const action = releaseAction(type, entry, { canTrack });
  if (!action) return null;
  const fields = action.ask ? releaseDetailFields(type, entry, { canTrack }) : [];

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
