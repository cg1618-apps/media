// Frontend: the notes page for the entry the Add form just created.
//
// Notes hang off an entry's system_id, so there is nothing to attach them to
// until the entry exists. Once a media submit handler has created one, the Add
// page renders this under its "Added" banner: the same NotesTemplate the
// detail pages and the Modify tabs embed, pointed at the new row.
//
// Unlike the Modify tabs it hides nothing. The Add form resets to a blank
// entry after a create, so its Remark field no longer edits this row, and the
// `remark` section here is the only editor left for it.
//
// `entry` is the row the create returned. It feeds `owner_where` (亮點
// Highlights is KR h-comics only) and the group order, which is the viewer's
// own: a holder of self.personal_notes may drag a group header to save a new
// one through PUT /api/me/highlight-group-order, as on the h-comic and h-game
// detail pages. Who may write which section is the notes page's own rule.
import { useState } from "react";

import { useHighlightGroupOrderSaver } from "../../api/mutations/useMyHighlightGroupOrder";
import { useAuth } from "../../contexts/AuthContext";
import NotesTemplate from "../notes/NotesTemplate";

export default function AddedEntryNotes({ ownerType, entry, name }) {
  const auth = useAuth();
  const ownsOrder = Boolean(auth?.has?.("self.personal_notes"));
  const [row, setRow] = useState(entry);
  const saveGroupOrder = useHighlightGroupOrderSaver(ownerType, entry.system_id, setRow);

  return (
    <section className="mb-6 space-y-2" aria-label={`Notes for ${name}`}>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
        Notes for {name}
      </h2>
      <NotesTemplate
        key={entry.system_id}
        ownerType={ownerType}
        ownerId={entry.system_id}
        owner={entry}
        groupOrder={row.highlight_group_order}
        onGroupOrderChange={ownsOrder ? saveGroupOrder : undefined}
      />
    </section>
  );
}
