// Frontend: how a note card's bilingual label is shortened.
//
// Note groups and sections are labelled Chinese first, then English -
// "資源&工具 Resources & Tools". The detail page's table of contents and its
// contents bar list them by the Chinese part alone, so the rows stay short.

const HAN = /\p{Script=Han}/u;
// The Chinese part, then whitespace and a trailing run that holds no Han.
const CHINESE_THEN_ENGLISH = /^(.*\p{Script=Han}\S*)\s+[A-Za-z][^\p{Script=Han}]*$/u;

/**
 * The Chinese part of a bilingual label: "資源&工具 Resources & Tools" reads
 * "資源&工具". A label with no Chinese ("Notes"), no trailing English
 * ("優缺點") or English first ("NG 多周目") is returned unchanged.
 */
export function chineseLabel(label) {
  if (!label || !HAN.test(label)) return label;
  return label.match(CHINESE_THEN_ENGLISH)?.[1] ?? label;
}
