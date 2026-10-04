// Frontend: page component file for CartoonNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function CartoonNotes({ cartoon, isAdmin, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="cartoon"
      ownerId={cartoon.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
