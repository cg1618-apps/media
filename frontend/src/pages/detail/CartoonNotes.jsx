// Frontend: page component file for CartoonNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function CartoonNotes({ cartoon, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="cartoon"
      ownerId={cartoon.system_id}
      series={series}
      franchise={franchise}
    />
  );
}
