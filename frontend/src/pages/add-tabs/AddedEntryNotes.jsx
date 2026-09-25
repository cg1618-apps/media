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
// Highlights is KR h-comics only) and the stored group order, which a drag of
// a group header rewrites with a PATCH, as the h-comic and h-game detail pages
// do.
import { useState } from "react";

import { endpoints } from "../../api/endpoints";
import { useToast } from "../../hooks/useToast";
import NotesTemplate from "../notes/NotesTemplate";

export default function AddedEntryNotes({ ownerType, entry, name }) {
  const { showToast } = useToast();
  const [groupOrder, setGroupOrder] = useState(entry.highlight_group_order);

  async function saveGroupOrder(names) {
    setGroupOrder(names);
    try {
      const res = await fetch(endpoints.resource(ownerType).patch(entry.system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highlight_group_order: names }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", "Group order saved");
    } catch {
      showToast("error", "Update failed");
    }
  }

  return (
    <section className="mb-6 space-y-2" aria-label={`Notes for ${name}`}>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
        Notes for {name}
      </h2>
      <NotesTemplate
        key={entry.system_id}
        ownerType={ownerType}
        ownerId={entry.system_id}
        isAdmin={true}
        owner={entry}
        groupOrder={groupOrder}
        onGroupOrderChange={saveGroupOrder}
      />
    </section>
  );
}
