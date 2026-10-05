// Frontend: the `choice_node` field of a structured note section - a save's
// link to a point in its game's choice graph.
//
// StructuredSection dispatches on the field type and hands over the owner's id,
// which for a save is the game's. Both halves read the same graph query the
// card does, so the page fetches the graph once however many saves it lists.
import { useChoiceGraph } from "../../api/mutations/useGameChoiceMutations";
import { nodesByKind } from "./choiceGraphData";

/** The edit control: this game's points grouped by kind, or none. */
export function ChoiceNodeSelect({ field, gameId, value, onChange, className }) {
  const { data } = useChoiceGraph(gameId);
  const nodes = data?.nodes || [];
  // A link to a point this list does not hold (deleted elsewhere, or not
  // loaded yet) is kept as an option so the select still shows a value.
  const unknown = value && !nodes.some((n) => n.id === value);
  return (
    <select
      value={value || ""}
      aria-label={field.label}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{field.label}: none</option>
      {unknown ? <option value={value}>Unknown point</option> : null}
      {nodesByKind(nodes).map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** The read view: the linked point's title, or nothing at all. */
export function ChoiceNodeName({ field, gameId, value, tagCls }) {
  const { data } = useChoiceGraph(value ? gameId : null);
  const node = (data?.nodes || []).find((n) => n.id === value);
  if (!node) return null;
  return (
    <span className={`${tagCls} normal-case tracking-normal`} title={field.label}>
      {field.label}: {node.title}
    </span>
  );
}
