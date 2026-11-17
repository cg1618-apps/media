// What a watch order is called on an entry's own page. It is one feature and
// one kind of order underneath; a game is played rather than watched, so a
// Game page names it "Play Order" and every other type keeps "Watch Order".
const PLAY_ORDER_TYPES = new Set(["game"]);

export function orderNoun(mediaType) {
  return PLAY_ORDER_TYPES.has(mediaType) ? "Play Order" : "Watch Order";
}
