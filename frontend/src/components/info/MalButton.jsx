// Frontend: the way out to MyAnimeList beside a character's name - where a
// character is looked up. Shared by the character page and the identity
// page, which shows its character's. Renders nothing without a link.
import { sourceIconUrl } from "../../lib/sourceIcons";

export default function MalButton({ href }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Open on MyAnimeList"
      className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:border-brand hover:text-brand"
    >
      <img loading="lazy" src={sourceIconUrl("MyAnimeList")} alt="" className="w-3.5 h-3.5" />
      MyAnimeList
    </a>
  );
}
