// Frontend: card component file for FranchiseCard.
import GroupCard from "./GroupCard";

// `cover` is the resolved { url, focus } from lib/covers.js.
export default function FranchiseCard({ franchise, cover }) {
  return <GroupCard kind="franchise" row={franchise} cover={cover} />;
}
