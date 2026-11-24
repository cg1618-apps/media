# A Highest expectation is the one expectation in colour

Design rule 5 says colour never encodes a category, and an expectation is a
category: Highest, High, Medium, Low. Every expectation chip was in the
neutral ink tone. Highest is now drawn in the brand tone. That covers the
group cards, the franchise and series library tables, and the
future-release cover overlay. Every other value stays ink.

**Why only Highest.** The owner asked for the most anticipated entries to
stand out when scanning a library. A colour for each of the four values
would be a legend the reader has to learn, which is exactly what rule 5
guards against. A single highlight needs no legend. The other three values
still read as text.

**Why the brand tone.** It is the one accent the design system already uses
for "this one matters" (the rating stamp, the active filter), and it works in
all three palettes. A new hue would need its own token in each palette and
its own contrast check.

**One place decides it.** `expectationTone` in `frontend/src/lib/groupSort.js`
sits next to the expectation sort weight, so every chip asks the same
question. A new card that shows an expectation should call it rather than
compare against "Highest" itself.
