// Frontend: page component file for NovelNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function NovelNotes({ novel, hideSections, series, franchise }) {
  return (
    <NotesTemplate
      ownerType="novel"
      ownerId={novel.system_id}
      hideSections={hideSections}
      series={series}
      franchise={franchise}
    />
  );
}
