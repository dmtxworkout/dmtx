# Glosario ES ⇄ EN

Code identifiers are English; UI copy is Spanish. All Spanish strings live in `apps/admin/src/i18n/es.ts` — **never hardcode Spanish in components**. This is the source of truth for copy and the upgrade path to `next-intl` if a second locale is ever needed.

## Entities

| Code (EN) | UI (ES) |
|---|---|
| exercise | ejercicio |
| workout | rutina |
| program | programa |
| skill | habilidad |
| collection | colección |
| muscle / muscle group | músculo / grupo muscular |
| equipment | equipo |
| subscription | suscripción |
| payment | pago |
| discount | descuento |

## Enums

| difficulty | dificultad | measurement | medición | status | estado |
|---|---|---|---|---|---|
| beginner | Principiante | reps | Repeticiones | draft | Borrador |
| intermediate | Intermedio | time | Tiempo | published | Publicado |
| advanced | Avanzado | distance | Distancia | archived | Archivado |

## Workout formats

| Code | UI / meaning |
|---|---|
| amrap | AMRAP — máximas rondas posibles en un tiempo |
| emom | EMOM — cada minuto, al minuto |
| tabata | Tabata — trabajo/descanso por intervalos |
| strength | Fuerza — series y repeticiones |
| chipper | Chipper — lista completada una vez, por tiempo |
| for_time | Por tiempo |
| circuit | Circuito |

## Tempo (the 4 phases)

| Code | UI (ES) |
|---|---|
| holdTop | Hold arriba |
| eccentric | Negativa (bajando) |
| holdBottom | Hold abajo |
| concentric | Positiva (subiendo) |

Each phase is seconds, or **"X"** for explosive / as fast as possible.

## Load prescription

| Code | UI (ES) |
|---|---|
| percent_1rm | % de 1RM |
| rpe | RPE |
| absolute | Peso absoluto (kg/lb) |
| bodyweight | Peso corporal (+ carga) |

| Estiramiento | stretch (`cooldown` section) | The third section of a rutina, after the main work; «Enfriamiento» was the earlier name and still parses. |
