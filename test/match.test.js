import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normBatch, skelBatch, mfrMatch, normMonth, productSimilarity } from '../core/normalize.js';
import { classifyPair, matchStock, baselineMatch, TIER } from '../core/match.js';

const nsq = {
  product: 'Lactic Acid Bacillus Tablets (Sporlac-DS)',
  batch: 'BDS25003',
  expiry: 'Jan-2027',
  mfr: 'M/s. Example Labs Pvt. Ltd., Hyderabad',
};

test('batch normalization drops formatting only', () => {
  assert.equal(normBatch(' bds-250/03 '), 'BDS25003');
  assert.equal(skelBatch('BDS25OO3'), skelBatch('BDS25003'));
  assert.notEqual(normBatch('BDS25OO3'), normBatch('BDS25003'));
});

test('expiry formats agree', () => {
  for (const s of ['Jan-2027', '01/2027', '1/27', '2027-01', 'JAN 27', '15/01/2027']) assert.equal(normMonth(s), '2027-01', s);
  assert.equal(normMonth(''), null);
});

test('manufacturer match ignores legal noise; unknown is not a mismatch', () => {
  assert.equal(mfrMatch('EXAMPLE LABS', nsq.mfr), true);
  assert.equal(mfrMatch('Cipla', nsq.mfr), false);
  assert.equal(mfrMatch('', nsq.mfr), null);
});

test('product similarity handles brand vs generic naming', () => {
  assert.ok(productSimilarity('SPORLAC DS TAB', nsq.product) >= 0.6);
  assert.ok(productSimilarity('PARACETAMOL 500MG TAB', nsq.product) < 0.6);
  assert.ok(productSimilarity('Telma H 40mg', 'Telmisartan Tablets IP 80 mg (TELMA)') < 0.6);
});

test('exact batch plus manufacturer -> FLAG', () => {
  const r = classifyPair({ product: 'SPORLAC DS TAB', batch: 'bds-25003', expiry: '01/27', mfr: 'Example Labs' }, nsq);
  assert.equal(r.tier, TIER.FLAG);
});

test('exact batch, different maker and expiry, similar product -> collision review', () => {
  const r = classifyPair({ product: 'SPORLAC DS', batch: 'BDS25003', expiry: '06/2026', mfr: 'Other Pharma' }, nsq);
  assert.equal(r.tier, TIER.REVIEW_COLLISION);
});

test('exact batch on an unrelated product from another maker -> no match', () => {
  const r = classifyPair({ product: 'AMOXYCILLIN 500 CAP', batch: 'BDS25003', expiry: '06/2026', mfr: 'Other Pharma' }, nsq);
  assert.equal(r, null);
});

test('confusable character -> near review, never a flag', () => {
  const r = classifyPair({ product: 'SPORLAC DS TAB', batch: 'BDS25OO3', expiry: '01/27', mfr: 'Example Labs' }, nsq);
  assert.equal(r.tier, TIER.REVIEW_NEAR);
});

test('same product, other batch -> info; baseline misses the hyphenated batch', () => {
  const stock = [
    { product: 'SPORLAC DS TAB', batch: 'BDS-25003', expiry: '01/27', mfr: 'Example Labs' },
    { product: 'SPORLAC DS TAB', batch: 'BDS25110', expiry: '05/27', mfr: 'Example Labs' },
  ];
  const out = matchStock(stock, [nsq]);
  assert.deepEqual(out.map((o) => o.tier), [TIER.FLAG, TIER.INFO]);
  assert.equal(baselineMatch(stock, [nsq]).length, 0);
});

test('shared industry words do not make two makers the same', () => {
  assert.equal(mfrMatch('Konark Lifesciences', 'M/s. Zenith Lifesciences Pvt. Ltd.'), false);
  assert.equal(mfrMatch('Daya Formulations', 'Apple Formulations Pvt. Ltd., Roorkee'), false);
});

// Cases found by the real-data eval (eval/real-eval.js).
test('maker names written with and without a space agree', () => {
  assert.equal(mfrMatch('Glaxo SmithKline Pharmaceuticals Ltd', 'GlaxoSmithKline Pharmaceuticals Ltd., Nashik'), true);
  assert.equal(mfrMatch('Pure & Cure Healthcare', 'Supercure Biotech Pvt. Ltd.'), false);
});

test('makers named only with generic words are compared, not unknown', () => {
  assert.equal(mfrMatch('Care Formulation Labs Pvt Ltd', 'Nikvin Healthcare (I) Pvt. Ltd., Baddi'), false);
  assert.equal(mfrMatch('Sun Pharma Laboratories Ltd.', 'Sun Pharmaceutical Industries Ltd'), true);
  assert.equal(mfrMatch('', 'Sun Pharmaceutical Industries Ltd'), null);
});

const augmentin = {
  product: 'Amoxycillin and Potassium Clavulanate Tablets IP (Brand Name : Augmentin 625)',
  batch: 'MR25031', expiry: 'Mar-2027', mfr: 'Medreich Ltd., Survey No. 14, Bengaluru',
};
const owners = { 'AUGMENTIN 625': { 'Glaxo SmithKline Pharmaceuticals Ltd': [1] } };
const shelf = { product: 'Augmentin 625 Duo Tablet', batch: 'MR25031', mfr: 'Glaxo SmithKline Pharmaceuticals Ltd' };

test('brand owner on the shelf, factory on the list: flag only when expiry agrees too', () => {
  assert.equal(classifyPair({ ...shelf, expiry: '03/27' }, augmentin, owners).tier, TIER.FLAG);
  assert.equal(classifyPair({ ...shelf, expiry: '03/27' }, augmentin, owners).reasons.mfr, 'brand-owner');
  assert.equal(classifyPair({ ...shelf, expiry: '' }, augmentin, owners).tier, TIER.REVIEW_COLLISION);
  assert.equal(classifyPair({ ...shelf, expiry: '07/27' }, augmentin, owners).tier, TIER.REVIEW_COLLISION);
});

test('no expiry column: an unknown maker with a shared product word is asked about, not dropped', () => {
  assert.equal(classifyPair({ ...shelf, expiry: '' }, augmentin, {}).tier, TIER.REVIEW_COLLISION);
  assert.equal(classifyPair({ product: 'PANTOP 40 TAB', batch: 'MR25031', expiry: '', mfr: 'Aristo' }, augmentin, {}), null);
});
