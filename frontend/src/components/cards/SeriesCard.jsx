// Frontend: card component file for SeriesCard.
import GroupCard from "./GroupCard";

// `cover` is the resolved { url, focus } from lib/covers.js.
export default function SeriesCard({ series, cover }) {
  return <GroupCard kind="series" row={series} cover={cover} />;
}
