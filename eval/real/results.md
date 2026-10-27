# Real-data eval

## A. Cross-lab re-reports (809 real CDSCO rows, 19 batch codes that appear more than once)

Each real row is matched as if it were a stock row against every other real row. Cells: flag / review / no alert.

| Method | Same batch, other lab (n=28) | Different product, same code (n=6) | Ambiguous (n=4) | Code seen once (n=771) | Flag precision | Flag recall |
|---|---|---|---|---|---|---|
| Exact batch lookup | 24 / 0 / 4 | 6 / 0 / 0 | 4 / 0 / 0 | 0 / 0 / 771 | 80% | 86% |
| Batch-only, ignore spaces/hyphens | 26 / 0 / 2 | 6 / 0 / 0 | 4 / 0 / 0 | 0 / 0 / 771 | 81% | 93% |
| Recall Join | 24 / 4 / 0 | 2 / 4 / 0 | 2 / 2 / 0 | 0 / 0 / 771 | 92% | 86% |

## B. Real retail names (93 regulator rows paired with the real retail listing of the same brand)

The shop row uses the retail product name and company; the batch is copied from the regulator row. Cells: flag / review / no alert.

### Export has expiry

| Method | Same company named (n=42) | Brand owner named, regulator lists the plant (n=12) | Two different firms (n=39) | Same-company auto-flag rate | Silently missed (no alert, any group) |
|---|---|---|---|---|---|
| Exact batch lookup | 42 / 0 / 0 | 12 / 0 / 0 | 39 / 0 / 0 | 100% | 0/93 |
| Batch-only, ignore spaces/hyphens | 42 / 0 / 0 | 12 / 0 / 0 | 39 / 0 / 0 | 100% | 0/93 |
| Recall Join | 41 / 1 / 0 | 0 / 12 / 0 | 7 / 32 / 0 | 98% | 0/93 |

### Export has no expiry column

| Method | Same company named (n=42) | Brand owner named, regulator lists the plant (n=12) | Two different firms (n=39) | Same-company auto-flag rate | Silently missed (no alert, any group) |
|---|---|---|---|---|---|
| Exact batch lookup | 42 / 0 / 0 | 12 / 0 / 0 | 39 / 0 / 0 | 100% | 0/93 |
| Batch-only, ignore spaces/hyphens | 42 / 0 / 0 | 12 / 0 / 0 | 39 / 0 / 0 | 100% | 0/93 |
| Recall Join | 39 / 3 / 0 | 0 / 11 / 1 | 7 / 27 / 5 | 93% | 6/93 |

## Every miss

A. Exact batch lookup:
  same      none   BKBP02601 | Bupivacaine Hydrochloride In Dextrose Injection USP (Brand N | Themis Medicare Ltd. ,11/12, Udyog Nagar
  same      none   SBT3269 | Loperamide Hydrochloride Tablets IP 2 mg (Brand Name : LOPRA | Supercure Biotech Pvt.Ltd, Plot No.99/4/
  same      none   BKBP O2601 | BUPIVACAINE HYDROCHLORIDE IN DEXTROSE INJECTION USP (Bupicai | Themis Medicare Limited, At : Gat No.: 2
  same      none   SBT-3269 | Loperamide Hydrochloride Tablets IP 2 mg- (Brand Name : Lopr | Supercure Biotech Pvt.Ltd., Plot No. 99/
  different flag   MWDC-5421G | Cefixime & Azithromycin Tablets (Brand Name : Jikcf-AZ Table | Geenac Pharma, - Plot No.-582, Raipur, B
  different flag   MWDC-5421G | Amoxycillin & Potassium Clavulanate, Lactic Acid Bacillus Ta | Sabi Pharmaceuticals Pvt. Ltd - . Shivna
  different flag   Not Mentioned | Nimesulide & Paracetamol Tablets (Brand Name : Nimesulide-P) | Euphoria India Pharmaceuticals, Plot No.
  different flag   Not Mentioned | Amoxycillin &Potassium Clavulanate Tablets (Brand Name : Sun | Astam Healthcare Pvt. Ltd., Vill. Thada,
  different flag   05 | X-ray Detectble Labarotomy Sponges IS 10829 (Brand Name : Mo | Sri Sandana Magalingam Textiles, 5-A-1/1
  different flag   05 | Gauze and cotton Tissue BP 1988 (Brand Name : Dressing Pad) | Sri Sandana Magalingam Textiles, 5-A-1/1
  ambiguous flag   VBC-0116 | Mebendazole IP & Ivermectin IP Vet Oral Powder (Brand Name : | Vrindha Biotech Pvt. Ltd. - Khasra No. 1
  ambiguous flag   G 43 | Absorbent Gauze (Super Deluxe) IS 758 (NOT STERILIZED) (Bran | Muthu Surgicals, 551/15, Alangulam Road,
  ambiguous flag   VBC-0116 | Mebendazole IP & Ivermectin IP Vet Oral Powder (Brand Name : | Cure Quick Pharmaceuticals , 20-21/3, Se
  ambiguous flag   G 43 | Absorbent Gauze IS 758 (Brand Name : Superfine) | Muthu Surgicals, 551/15, Alangulam Road,

A. Batch-only, ignore spaces/hyphens:
  same      none   BKBP02601 | Bupivacaine Hydrochloride In Dextrose Injection USP (Brand N | Themis Medicare Ltd. ,11/12, Udyog Nagar
  same      none   BKBP O2601 | BUPIVACAINE HYDROCHLORIDE IN DEXTROSE INJECTION USP (Bupicai | Themis Medicare Limited, At : Gat No.: 2
  different flag   MWDC-5421G | Cefixime & Azithromycin Tablets (Brand Name : Jikcf-AZ Table | Geenac Pharma, - Plot No.-582, Raipur, B
  different flag   MWDC-5421G | Amoxycillin & Potassium Clavulanate, Lactic Acid Bacillus Ta | Sabi Pharmaceuticals Pvt. Ltd - . Shivna
  different flag   Not Mentioned | Nimesulide & Paracetamol Tablets (Brand Name : Nimesulide-P) | Euphoria India Pharmaceuticals, Plot No.
  different flag   Not Mentioned | Amoxycillin &Potassium Clavulanate Tablets (Brand Name : Sun | Astam Healthcare Pvt. Ltd., Vill. Thada,
  different flag   05 | X-ray Detectble Labarotomy Sponges IS 10829 (Brand Name : Mo | Sri Sandana Magalingam Textiles, 5-A-1/1
  different flag   05 | Gauze and cotton Tissue BP 1988 (Brand Name : Dressing Pad) | Sri Sandana Magalingam Textiles, 5-A-1/1
  ambiguous flag   VBC-0116 | Mebendazole IP & Ivermectin IP Vet Oral Powder (Brand Name : | Vrindha Biotech Pvt. Ltd. - Khasra No. 1
  ambiguous flag   G 43 | Absorbent Gauze (Super Deluxe) IS 758 (NOT STERILIZED) (Bran | Muthu Surgicals, 551/15, Alangulam Road,
  ambiguous flag   VBC-0116 | Mebendazole IP & Ivermectin IP Vet Oral Powder (Brand Name : | Cure Quick Pharmaceuticals , 20-21/3, Se
  ambiguous flag   G 43 | Absorbent Gauze IS 758 (Brand Name : Superfine) | Muthu Surgicals, 551/15, Alangulam Road,

A. Recall Join:
  same      review BKBP02601 | Bupivacaine Hydrochloride In Dextrose Injection USP (Brand N | Themis Medicare Ltd. ,11/12, Udyog Nagar
  same      review BKBP O2601 | BUPIVACAINE HYDROCHLORIDE IN DEXTROSE INJECTION USP (Bupicai | Themis Medicare Limited, At : Gat No.: 2
  same      review ACG25007 | Nicardia Retard 10 Tablet (Brand Name : NA) | J.B.Chemicals & Pharmaceuticals Ltd.,At.
  same      review ACG25007 | Nifedipine Sustained Release Tablets IP 10 mg (Brand Name :  | J.B.Chemicals & Pharmaceuticals Ltd.,128
  different flag   05 | X-ray Detectble Labarotomy Sponges IS 10829 (Brand Name : Mo | Sri Sandana Magalingam Textiles, 5-A-1/1
  different flag   05 | Gauze and cotton Tissue BP 1988 (Brand Name : Dressing Pad) | Sri Sandana Magalingam Textiles, 5-A-1/1
  ambiguous flag   G 43 | Absorbent Gauze (Super Deluxe) IS 758 (NOT STERILIZED) (Bran | Muthu Surgicals, 551/15, Alangulam Road,
  ambiguous flag   G 43 | Absorbent Gauze IS 758 (Brand Name : Superfine) | Muthu Surgicals, 551/15, Alangulam Road,

B. Exact batch lookup:
  none

B. Batch-only, ignore spaces/hyphens:
  none

B. Recall Join:
  same-company review r038 Betnovate-N  Cream | Glaxo SmithKline Pharmaceuticals Ltd vs GlaxoSmithKline Pharmaceuticals Ltd., A-

B. Exact batch lookup (no expiry):
  none

B. Batch-only, ignore spaces/hyphens (no expiry):
  none

B. Recall Join (no expiry):
  same-company review r007 GENTALAB 40 MG INJECTION | Laborate Pharmaceuticals India Ltd vs M/s. Laborate Pharmaceuticals India Ltd.
  same-company review r038 Betnovate-N  Cream | Glaxo SmithKline Pharmaceuticals Ltd vs GlaxoSmithKline Pharmaceuticals Ltd., A-
  same-company review r061 Talgesic 0.3mg Injection | Indus Pharma Pvt Ltd vs Indus Pharma Pharma Pvt. Ltd. , A-181 RI
  brand-owner  none   r022 Augmentin 625 Duo Tablet | Glaxo SmithKline Pharmaceuticals Ltd vs Medreich Ltd., Survey No. 14 &v 15, Gund
  unclear      none   r016 Torabest IT 100mg/250mg Tablet | Biochemix Health Care Pvt. Ltd. vs Accura Care Pharmaceuticals Pvt.Ltd, Vil
  unclear      none   r018 Mucorant Expectorant | Micro Labs Ltd vs Bestcare Formulation Pvt, Ltd., Plot No.
  unclear      none   r047 Rabenova DSR 30mg/20mg Tablet | Raphael Pharmaceuticals Pvt Ltd vs Athens Life Sciences, Mauza Rampur, Jatt
  unclear      none   r070 Onlycef SB 1.5gm Injection | Skymax Life Science Pvt Ltd vs Actinova Pvt. Ltd. , At: 147, Mauza, San
  unclear      none   r085 Nimcef OL 200mg/200mg Tablet | Nimbus Health Care Pvt Ltd vs Medinok Healthcare Pvt. Ltd, (A GMP & IS

