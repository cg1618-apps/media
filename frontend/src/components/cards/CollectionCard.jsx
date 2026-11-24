// Frontend: card component file for CollectionCard.
import GroupCard from "./GroupCard";

import { eyebrowCls } from "../ui/primitives";
// `cover` is the resolved { url, focus } from lib/covers.js. The expectation
// sits above the franchise count.
export default function CollectionCard({ collection, cover, memberCount }) {
  return (
    <GroupCard
      kind="collection"
      row={collection}
      cover={cover}
      expectationFirst
      badge={
        memberCount > 0 && (
          <div className="absolute top-1 left-1 bg-black/60 text-white px-1.5 py-0.5 font-mono text-[9px] leading-none z-10">
            {memberCount}
          </div>
        )
      }
    >
      <span className={eyebrowCls}>
        {memberCount} {memberCount === 1 ? "franchise" : "franchises"}
      </span>
    </GroupCard>
  );
}
