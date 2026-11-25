// Frontend: info component file for NamingCard.
//
// Only the names the item actually has are listed - a blank one gets no row -
// and with none set the card is left out entirely. `namingRows` is the same
// list as InfoCard rows, for a page that sets the names inside another card
// (the person page leads its Profile card with them).
import InfoCard from "./InfoCard";
import { getNamingFields } from "../../utils/media";

const hasValue = ({ value }) => value != null && String(value).trim() !== "";

/** The item's set names as InfoCard rows, one per line. */
export function namingRows(type, item) {
  return getNamingFields(item, type).filter(hasValue);
}

export default function NamingCard({ type, item }) {
  const fields = namingRows(type, item);
  if (fields.length === 0) return null;
  return <InfoCard title="Naming" fields={fields} />;
}
