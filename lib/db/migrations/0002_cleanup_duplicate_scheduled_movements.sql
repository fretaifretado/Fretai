-- Keep one target assignment for each identical pending/active schedule.
-- Active assignments win over pending ones; ties keep the oldest movement.
BEGIN;

CREATE TEMP TABLE duplicate_scheduled_movement_targets ON COMMIT DROP AS
WITH ranked_targets AS (
  SELECT
    target.id AS target_id,
    target.scheduled_movement_id,
    ROW_NUMBER() OVER (
      PARTITION BY
        movement.company_id,
        movement.tipo,
        movement.valor_novo,
        COALESCE(movement.filial_id_novo, -1),
        movement.inicio,
        movement.fim,
        target.colaborador_id
      ORDER BY
        CASE movement.estado
          WHEN 'ativo' THEN 0
          WHEN 'pendente' THEN 1
          ELSE 2
        END,
        movement.id
    ) AS duplicate_rank
  FROM scheduled_movements AS movement
  INNER JOIN scheduled_movement_targets AS target
    ON target.scheduled_movement_id = movement.id
  WHERE movement.estado IN ('pendente', 'ativo')
)
SELECT target_id, scheduled_movement_id
FROM ranked_targets
WHERE duplicate_rank > 1;

DELETE FROM scheduled_movement_targets AS target
USING duplicate_scheduled_movement_targets AS duplicate
WHERE target.id = duplicate.target_id;

DELETE FROM scheduled_movements AS movement
WHERE movement.estado IN ('pendente', 'ativo')
  AND NOT EXISTS (
    SELECT 1
    FROM scheduled_movement_targets AS target
    WHERE target.scheduled_movement_id = movement.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_movement_target_unique_idx
  ON scheduled_movement_targets (scheduled_movement_id, colaborador_id);

COMMIT;
