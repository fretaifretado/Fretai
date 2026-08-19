BEGIN;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS source_key text;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY company_id, employee_id, periodo
           ORDER BY id
         ) AS duplicate_rank
  FROM purchase_orders
  WHERE employee_id IS NOT NULL
    AND vales > 0
    AND status <> 'Cancelado'
)
UPDATE purchase_orders AS purchase
SET status = 'Cancelado'
FROM ranked
WHERE purchase.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_source_key_uidx
  ON purchase_orders (source_key)
  WHERE source_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_employee_period_positive_uidx
  ON purchase_orders (company_id, employee_id, periodo)
  WHERE employee_id IS NOT NULL
    AND vales > 0
    AND status <> 'Cancelado';

COMMIT;
