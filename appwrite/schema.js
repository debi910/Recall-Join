// Single source of truth for the TablesDB layout. scripts/setup.js applies it.
export const DB = process.env.APPWRITE_DB_ID || 'recall';

const v = (key, size = 255, required = false) => ({ type: 'varchar', key, size, required });
const t = (key, required = false) => ({ type: 'text', key, required });
const e = (key, elements, required = true, xdefault = null) => ({ type: 'enum', key, elements, required, xdefault });

export const TABLES = [
  {
    id: 'alerts', name: 'Regulator alert lists', rowSecurity: false,
    columns: [v('period', 7, true), e('source', ['central', 'state', 'spurious']), v('source_url', 1000), { type: 'integer', key: 'rows_count', required: false }],
    indexes: [{ key: 'by_period', type: 'unique', columns: ['period', 'source'] }],
  },
  {
    id: 'nsq_batches', name: 'Failed batches (CDSCO)', rowSecurity: false,
    columns: [
      t('product', true), v('batch', 64, true), v('batch_norm', 64, true), v('batch_skel', 64, true),
      v('mfg', 16), v('expiry', 16), t('mfr'), t('result'), v('lab', 255), v('period', 7, true),
      e('source', ['central', 'state', 'spurious']), v('alert_id', 36, true),
    ],
    indexes: [
      { key: 'by_skel', type: 'key', columns: ['batch_skel'] },
      { key: 'by_norm', type: 'key', columns: ['batch_norm'] },
      { key: 'by_period', type: 'key', columns: ['period'] },
    ],
  },
  {
    id: 'stock_items', name: 'Shop stock by batch', rowSecurity: true,
    columns: [
      v('shop_id', 36, true), t('product', true), v('batch', 64, true), v('batch_norm', 64, true), v('batch_skel', 64, true),
      v('expiry', 16), v('mfr', 255), { type: 'integer', key: 'qty', required: false, xdefault: 0 },
      { type: 'float', key: 'mrp', required: false, xdefault: 0 }, v('supplier', 255),
      e('status', ['active', 'quarantined'], false, 'active'),
    ],
    indexes: [
      { key: 'by_shop_skel', type: 'key', columns: ['shop_id', 'batch_skel'] },
      { key: 'by_skel', type: 'key', columns: ['batch_skel'] },
    ],
  },
  {
    id: 'matches', name: 'Join results', rowSecurity: true,
    columns: [
      v('shop_id', 36, true), v('stock_id', 36, true), v('nsq_id', 36, true),
      e('tier', ['flag', 'collision', 'near', 'info']), t('reasons'),
      e('decision', ['pending', 'quarantined', 'dismissed'], false, 'pending'), v('decided_by', 36),
      { type: 'float', key: 'value', required: false, xdefault: 0 }, v('period', 7),
    ],
    indexes: [{ key: 'by_shop', type: 'key', columns: ['shop_id', 'tier'] }],
  },
  {
    id: 'return_notes', name: 'Returns to supplier', rowSecurity: true,
    columns: [
      v('shop_id', 36, true), v('shop_name', 255), v('supplier', 255, true), v('distributor_team', 36),
      t('items', true), { type: 'float', key: 'total_value', required: false, xdefault: 0 },
      e('status', ['open', 'collected'], false, 'open'),
    ],
    indexes: [{ key: 'by_shop', type: 'key', columns: ['shop_id'] }],
  },
  {
    id: 'audit', name: 'Audit trail', rowSecurity: true,
    columns: [v('shop_id', 36, true), v('action', 64, true), t('detail'), v('actor', 36), { type: 'boolean', key: 'verified', required: false, xdefault: false }],
    indexes: [{ key: 'by_shop', type: 'key', columns: ['shop_id'] }],
  },
];
