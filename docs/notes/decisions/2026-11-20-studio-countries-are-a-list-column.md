# A studio's countries are a JSONB list on the row

A studio can name several countries (a Japanese studio with a Chinese
branch, a co-founded one). They live in `studio.countries`, a JSONB list of
free-text names, NULL when none is known.

**Why a list column and not a child table.** A child table
(`studio_country`, shaped like `publisher_scope`) earns its keep when the
values are keys something joins on or a constraint checks. A country is
neither: it is free text, suggested from the `Country` common options and
never required to be one of them, and the only reader that looks across
studios is the library filter, which already holds every row client-side. A
table would cost a relationship, a Sheets tab and a Pull translation step for
nothing a query needs. The h-game choice lists are the same shape and set the
precedent.

**Why NULL and never `[]`.** `merge_fill` fills a survivor's blank columns
from the loser's, and "blank" is NULL or whitespace. An empty list would read
as a value and block the fill, and two spellings of "none known" would split
the library's Not set chip.

**Why the form holds comma-separated text.** Every tags field's form state is
text that `MultiSelect` edits, and a saved default on `/defaults` is coerced to
text. Holding the countries the same way keeps both working unchanged; the
list exists only at the API boundary (`lib/countries.js`).

**Why the filter chips need more than five studios.** One chip per distinct
country turned the panel into a list of one-off spellings. A country gets a
chip once more than five studios name it; everything rarer shares **Others**,
so no studio becomes unreachable by the filter.

Rejected: keeping `country` a single value and typing several into it
comma-separated. It would have needed no migration, but every reader - the
filter, the detail page, a Pull - would have had to split it, and the column
would still claim to hold one country.
