// Frontend: card component file for CollectionCard.
import GroupCard from "./GroupCard";

// `cover` is the resolved { url, focus } from lib/covers.js.
export default function CollectionCard({ collection, cover, memberCount }) {
  return (
    <GroupCard
      kind="collection"
      row={collection}
      cover={cover}
      badge={
        memberCount > 0 && (
          <div className="absolute top-1 left-1 bg-black/60 text-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] leading-none z-10">
            {memberCount}
          </div>
        )
      }
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {memberCount} {memberCount === 1 ? "franchise" : "franchises"}
      </span>
    </GroupCard>
  );
}
