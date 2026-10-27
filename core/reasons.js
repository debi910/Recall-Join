// Groups CDSCO's free-text "NSQ Result" into a few readable categories (for charts only).
const CATEGORIES = [
  ['Wrong or missing drug', /identi?t|idetity|content \(nil\)/i],
  ['Too little / too much drug', /assay|content of|contains of|claim|calim|found|\d+(\.\d+)?\s*%/i],
  ['Doesn\'t dissolve properly', /dissol|disinteg|dispose/i],
  ['Contamination', /particul|microb|steril|bacteri|endotox|related substance|insolub/i],
  ['Looks wrong', /descri|appear|colou?r|mottled/i],
  ['Weight / volume / pH', /weight|volume|fill|\bph\b/i],
  ['Misbranded', /misbrand/i],
];
export function reasonCategory(text) {
  return (CATEGORIES.find(([, re]) => re.test(text || '')) || ['Not specified'])[0];
}
