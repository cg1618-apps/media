// Frontend: renders one Resources item's Markdown body.
//
// react-markdown builds React elements, never HTML strings, and without
// rehype-raw any raw HTML in the source is dropped rather than rendered. Its
// default urlTransform is kept on purpose: it blanks any link whose protocol is
// not http(s), mailto, irc(s) or xmpp, so a `javascript:` link renders inert.
// remark-gfm adds autolinked bare URLs, tables, strikethrough and task lists.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

// Every link leaves the site: a resource is a pointer somewhere else.
function ExternalLink({ node: _node, children, ...props }) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const COMPONENTS = { a: ExternalLink };

// Descendant styling in tokens only - there is no typography plugin, and
// theme-tokens.test.js refuses hard-coded greys.
const PROSE_CLS = [
  "text-sm text-text leading-relaxed break-words",
  "[&_p]:my-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-brand-hover",
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
  "[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2",
  "[&_code]:font-mono [&_code]:text-xs [&_code]:bg-surface-2 [&_code]:px-1",
  "[&_pre]:bg-surface-2 [&_pre]:border [&_pre]:border-border [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre_code]:px-0",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-muted",
  "[&_hr]:border-border [&_hr]:my-3",
  "[&_table]:text-xs [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1 [&_th]:font-mono [&_th]:text-left",
].join(" ");

export default function ResourceMarkdown({ children }) {
  return (
    <div className={PROSE_CLS}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
