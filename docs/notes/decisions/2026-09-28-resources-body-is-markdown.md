# A Resources item's body is Markdown

An item on the Resources page (`/resources`) is one Markdown `content` field
plus an optional `title`, rendered with `react-markdown` and `remark-gfm`.

- **Chosen over structured fields** (a title, a text and a link per item) **so
  a link can sit inside a sentence.** The notes this page holds are mostly
  "use X for Y, but read Z first", with the links in the prose; link columns
  lose where each link sits in the text.
- **`remark-gfm`** so a pasted bare URL links itself and tables and lists read
  as expected.
- **No raw HTML.** There is no `rehype-raw`, so HTML in the source is dropped,
  and the default URL transform blanks any link whose protocol is not http(s),
  mailto, irc(s) or xmpp — a `javascript:` link renders inert. Every link opens
  in a new tab with `rel="noopener noreferrer"`. Editors write items and
  everyone reads them, so the renderer is what stands between an item and a
  reader's session.
- **The cost** is a ~175 kB (54 kB gzip) route chunk, loaded only by
  `/resources` because the page is lazy.
