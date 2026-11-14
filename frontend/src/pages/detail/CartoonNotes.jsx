// Frontend: page component file for CartoonNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function CartoonNotes({ cartoon, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="cartoon"
      ownerId={cartoon.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
