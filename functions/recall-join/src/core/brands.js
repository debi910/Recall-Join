// Brand names as the regulator writes them, and how retail listings name the same brand.
// Used to build the brand-owner table (tools/build-brand-owners.js) and the real-data eval.

const spaced = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// "Amoxycillin ... Tablets IP (Brand Name : Augmentin 625)" -> "AUGMENTIN 625". Null when there is none.
export function brandKey(product) {
  const brand = String(product ?? '').match(/\((?:Brand Name\s*:\s*)?([^()]+)\)\s*$/i)?.[1]?.trim();
  if (!brand || /^(NA|N\.?A\.?|NIL|-)$/i.test(brand)) return null;
  const key = spaced(brand.replace(/^Brand Name\s*:\s*/i, '').replace(/\b(tablets?|capsules?|injection|syrup|cream|suspension|dry syrup|cap\.?|tab\.?)\b/gi, ''));
  return key.replace(/ /g, '').length >= 4 ? key : null;
}

// Does a retail name start with this brand? "LOPRA" must not match "LOPRAMIDE",
// "GATOVAS 20" may match "GATOVAS 20MG".
export function brandPrefix(name, key) {
  const n = spaced(name);
  if (!n.startsWith(key)) return false;
  const next = n[key.length];
  return !next || (/[A-Z]/.test(key.at(-1)) ? !/[A-Z]/.test(next) : !/[0-9]/.test(next));
}

const FORMS = [['inject', /INJ/], ['liquid', /SYRUP|SUSP|SOLUTION|EXPECTORANT|DROP|LIQUID/], ['topical', /CREAM|GEL|OINTMENT|LOTION/], ['soap', /SOAP/], ['oral solid', /TAB|CAP/]];
export const doseForm = (s) => FORMS.find(([, re]) => re.test(String(s).toUpperCase()))?.[0];

// The first active ingredient as the regulator spells it ("Cefixime" -> "CEFIXI").
export const firstIngredient = (product) => String(product ?? '').split(/[\s,&]+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// Returns a test for "this retail listing is this regulator row's brand": same brand
// prefix, same first ingredient, no conflicting dose form. Null when the row has no brand.
export function brandMatcher(nsqProduct) {
  const key = brandKey(nsqProduct), ing = firstIngredient(nsqProduct), form = doseForm(nsqProduct);
  if (!key || ing.length < 5) return null;
  return (listing) => {
    if (!brandPrefix(listing.name, key)) return false;
    if (!String(listing.comp).toUpperCase().replace(/[^A-Z0-9]/g, '').includes(ing)) return false;
    const f = doseForm(listing.name);
    return !form || !f || form === f;
  };
}
