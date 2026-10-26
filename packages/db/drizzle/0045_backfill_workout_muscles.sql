-- What every existing rutina works, as the API derives it on save
-- (packages/core/src/muscles.ts): the main section's exercises, a muscle
-- primary when at least a quarter of them work it; «Cuerpo completo» at four
-- primary zones.
WITH ex AS (
  SELECT b.workout_id, i.exercise_id
  FROM workout_items i JOIN workout_blocks b ON b.id = i.block_id
  WHERE b.section = 'main' AND i.kind = 'exercise' AND i.exercise_id IS NOT NULL
), tot AS (
  SELECT workout_id, count(*)::float AS n FROM ex GROUP BY workout_id
), mu AS (
  SELECT ex.workout_id, em.muscle_id, count(*)::float AS c
  FROM ex JOIN exercise_muscles em ON em.exercise_id = ex.exercise_id
  GROUP BY ex.workout_id, em.muscle_id
)
INSERT INTO workout_muscles (workout_id, muscle_id, role, manual)
SELECT mu.workout_id, mu.muscle_id, (CASE WHEN mu.c / tot.n >= 0.25 THEN 'primary' ELSE 'secondary' END)::muscle_role, false
FROM mu JOIN tot ON tot.workout_id = mu.workout_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE workouts w SET full_body = (
  SELECT count(DISTINCT m.zone) >= 4
  FROM workout_muscles wm JOIN muscles m ON m.id = wm.muscle_id
  WHERE wm.workout_id = w.id AND wm.role = 'primary' AND m.zone IS NOT NULL
);
