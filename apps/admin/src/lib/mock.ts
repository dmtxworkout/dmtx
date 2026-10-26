import type { BadgeTone } from '@/components/ui/badge';

/**
 * Placeholder data for the base pages whose backend isn't built yet. Real data
 * comes from the API as each area is implemented (see docs/roadmap.md).
 */

const BADGE_LABEL: Record<BadgeTone, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
  active: 'Activa',
  trialing: 'Prueba',
  past_due: 'Pago fallido',
  paused: 'En pausa',
  canceled: 'Cancelada',
  neutral: '—',
};

// --- Panel -------------------------------------------------------------------
export const dashStats = [
  { label: 'Rutinas', value: '312', delta: '+8 esta semana', tone: 'pos' as const },
  { label: 'Ejercicios', value: '1 248', delta: '96 sin video', tone: 'neutral' as const },
  { label: 'Programas', value: '48', delta: '6 en borrador', tone: 'neutral' as const },
  { label: 'Suscriptores', value: '1 842', delta: '+64 este mes', tone: 'pos' as const },
];

export const resumeCards = [
  { name: 'Tirón explosivo · Semana 3', meta: 'AMRAP · 18 min', dur: '18 min', ago: 'hace 4 min' },
  { name: 'Piernas unilateral', meta: 'EMOM · 20 min', dur: '20 min', ago: 'hace 1 h' },
  { name: 'Core diario', meta: 'Tabata · 12 min', dur: '12 min', ago: 'ayer' },
];

export const publishedItems = [
  { kind: 'Rutina', name: 'Full body express', when: 'hoy' },
  { kind: 'Programa', name: 'Verano corto · 21 días', when: 'ayer' },
  { kind: 'Rutina', name: 'Movilidad matutina', when: 'ayer' },
  { kind: 'Habilidad', name: 'Muscle-up · Nivel 2', when: 'lun' },
  { kind: 'Rutina', name: 'Sprint & core', when: 'lun' },
];

export const attentionItems = [
  { name: 'Handstand drills', why: 'sin portada', dot: '#d1502a' },
  { name: 'Fuerza 8 semanas · v2', why: '1 día vacío', dot: '#c98a1a' },
  { name: 'Remo invertido', why: 'sin video', dot: '#d1502a' },
  { name: 'Empieza aquí', why: 'sin publicar', dot: '#c98a1a' },
  { name: 'Pistol squat', why: 'sin músculos', dot: '#c98a1a' },
];

// --- Rutinas -----------------------------------------------------------------
export const rutinaFilters = ['Todo', 'AMRAP', 'EMOM', 'Tabata', 'Fuerza', 'Video'];

type Card = {
  name: string;
  meta: string;
  format: string;
  dur: string;
  badge: string;
  tone: BadgeTone;
  ago: string;
};

export const rutinaCards: Card[] = [
  { name: 'Tirón explosivo · Semana 3', meta: 'AMRAP · Avanzado', format: 'AMRAP', dur: '18 min', badge: 'Borrador', tone: 'draft', ago: 'hace 4 min' },
  { name: 'Full body express', meta: 'AMRAP · Intermedio', format: 'AMRAP', dur: '10 min', badge: 'Publicado', tone: 'published', ago: 'hoy' },
  { name: 'Core diario', meta: 'Tabata · Principiante', format: 'TABATA', dur: '12 min', badge: 'Publicado', tone: 'published', ago: 'ayer' },
  { name: 'Piernas unilateral', meta: 'EMOM · Avanzado', format: 'EMOM', dur: '20 min', badge: 'Borrador', tone: 'draft', ago: 'hace 1 h' },
  { name: 'Sprint & core', meta: 'AMRAP · Intermedio', format: 'AMRAP', dur: '15 min', badge: 'Publicado', tone: 'published', ago: 'lun' },
  { name: 'Movilidad matutina', meta: 'Video · Principiante', format: 'VIDEO', dur: '14 min', badge: 'Publicado', tone: 'published', ago: 'ayer' },
  { name: 'Fuerza tren superior', meta: 'Fuerza · Avanzado', format: 'FUERZA', dur: '45 min', badge: 'Publicado', tone: 'published', ago: '2 d' },
  { name: 'Chipper 100 reps', meta: 'Chipper · Avanzado', format: 'CHIPPER', dur: '25 min', badge: 'Borrador', tone: 'draft', ago: '3 d' },
  { name: 'Handstand drills', meta: 'Video · Intermedio', format: 'VIDEO', dur: '9 min', badge: 'Archivado', tone: 'archived', ago: '1 sem' },
  { name: 'Remo invertido — técnica', meta: 'Fuerza · Principiante', format: 'FUERZA', dur: '30 min', badge: 'Publicado', tone: 'published', ago: '1 sem' },
];

// --- Programas ---------------------------------------------------------------
export const programaCards: Card[] = [
  { name: 'Fuerza 8 semanas · v2', meta: 'Calendario · 56 días', format: 'CALENDARIO', dur: '8 sem', badge: 'Borrador', tone: 'draft', ago: 'hace 20 min' },
  { name: 'Verano corto', meta: 'Calendario · 21 días', format: 'CALENDARIO', dur: '21 d', badge: 'Publicado', tone: 'published', ago: 'ayer' },
  { name: 'Empieza aquí', meta: 'Playlist · 12 videos', format: 'PLAYLIST', dur: '12 vid', badge: 'Borrador', tone: 'draft', ago: '2 d' },
  { name: 'Movilidad 30 días', meta: 'Calendario · 30 días', format: 'CALENDARIO', dur: '30 d', badge: 'Publicado', tone: 'published', ago: '4 d' },
  { name: 'Anillas de cero', meta: 'Calendario · 42 días', format: 'CALENDARIO', dur: '6 sem', badge: 'Publicado', tone: 'published', ago: '1 sem' },
  { name: 'Reto core 14 días', meta: 'Playlist · 14 videos', format: 'PLAYLIST', dur: '14 vid', badge: 'Publicado', tone: 'published', ago: '2 sem' },
];

// --- Habilidades -------------------------------------------------------------
type Level = { n: number; name: string; workout: string; goal: string; done: boolean };
export const skills: { name: string; meta: string; badge: string; tone: BadgeTone; levels: Level[] }[] = [
  {
    name: 'Muscle-up',
    meta: '5 niveles · 1 240 en progreso',
    badge: 'Publicado',
    tone: 'published',
    levels: [
      { n: 1, name: 'Dominada estricta', workout: 'Rutina · Base de tirón', goal: '8 reps', done: true },
      { n: 2, name: 'Fondos en barra', workout: 'Rutina · Empuje', goal: '6 reps', done: true },
      { n: 3, name: 'Transición asistida', workout: 'Rutina · Explosividad', goal: '3 reps', done: false },
      { n: 4, name: 'Muscle-up con banda', workout: 'Rutina · Técnica', goal: '2 reps', done: false },
      { n: 5, name: 'Muscle-up estricto', workout: 'Rutina · Final', goal: '1 rep', done: false },
    ],
  },
  {
    name: 'Pistol squat',
    meta: '4 niveles · 860 en progreso',
    badge: 'Publicado',
    tone: 'published',
    levels: [
      { n: 1, name: 'Sentadilla asistida', workout: 'Rutina · Movilidad', goal: '10 reps', done: true },
      { n: 2, name: 'Negativa a caja', workout: 'Rutina · Control', goal: '5 reps', done: false },
      { n: 3, name: 'Pistol asistido', workout: 'Rutina · Fuerza', goal: '3 reps', done: false },
      { n: 4, name: 'Pistol completo', workout: 'Rutina · Final', goal: '1 rep', done: false },
    ],
  },
  {
    name: 'Handstand',
    meta: '5 niveles · sin publicar',
    badge: 'Borrador',
    tone: 'draft',
    levels: [
      { n: 1, name: 'Pino contra pared', workout: 'Rutina · Base', goal: '30 s', done: false },
      { n: 2, name: 'Hollow hold', workout: 'Rutina · Core', goal: '45 s', done: false },
      { n: 3, name: 'Patada a pared', workout: 'Rutina · Técnica', goal: '10 reps', done: false },
    ],
  },
];

// --- Taxonomía ---------------------------------------------------------------
export const muscleGroups: { name: string; n: number; active?: boolean }[] = [
  { name: 'Pecho', n: 9 },
  { name: 'Espalda', n: 6, active: true },
  { name: 'Hombros', n: 5 },
  { name: 'Brazos', n: 7 },
  { name: 'Piernas', n: 11 },
  { name: 'Core', n: 6 },
  { name: 'Glúteos', n: 4 },
  { name: 'Cuerpo completo', n: 3 },
];
export const musclesOfGroup = [
  { name: 'Dorsal ancho', n: 84 },
  { name: 'Trapecio', n: 52 },
  { name: 'Romboides', n: 33 },
  { name: 'Redondo mayor', n: 21 },
  { name: 'Erectores espinales', n: 47 },
  { name: 'Infraespinoso', n: 18 },
];
export const equipmentList = [
  { name: 'Barra', n: 210 },
  { name: 'Anillas', n: 96 },
  { name: 'Mancuernas', n: 340 },
  { name: 'Kettlebell', n: 128 },
  { name: 'Banda elástica', n: 74 },
  { name: 'Peso corporal', n: 512 },
  { name: 'Caja / step', n: 61 },
];

// --- Biblioteca --------------------------------------------------------------
export const mediaFilters = ['Todo', 'Video', 'Imagen', 'Sin usar'];
export const media: { name: string; kind: string; dur: string; meta: string }[] = (
  [
    ['muscle-up-estricto-4k', 'VIDEO', '01:12', 'MP4 · 240 MB · 3 usos'],
    ['dominada-supina-lateral', 'VIDEO', '00:48', 'MP4 · 160 MB · 5 usos'],
    ['portada-tiron-s3', 'IMG', '16:9', 'JPG · 480 KB · 1 uso'],
    ['fondo-anillas-frontal', 'VIDEO', '00:52', 'MP4 · 180 MB · 2 usos'],
    ['hollow-hold-demo', 'VIDEO', '00:36', 'MP4 · 120 MB · 4 usos'],
    ['movilidad-matutina-full', 'VIDEO', '14:20', 'MP4 · 1.8 GB · 1 uso'],
    ['portada-anillas-n2', 'IMG', '16:9', 'JPG · 520 KB · 1 uso'],
    ['remo-invertido-side', 'VIDEO', '00:41', 'MP4 · 140 MB · 6 usos'],
    ['sprint-400-track', 'VIDEO', '02:05', 'MP4 · 420 MB · sin uso'],
    ['pistol-squat-asistido', 'VIDEO', '00:57', 'MP4 · 190 MB · sin uso'],
    ['portada-core-diario', 'IMG', '16:9', 'JPG · 390 KB · 1 uso'],
    ['handstand-drills-set', 'VIDEO', '09:40', 'MP4 · 1.2 GB · 1 uso'],
  ] as const
).map(([name, kind, dur, meta]) => ({ name, kind, dur, meta }));

// --- Suscripciones -----------------------------------------------------------
export const billingStats = [
  { label: 'MRR', value: '$38 420', delta: '+5.2 % vs. junio', tone: 'pos' as const },
  { label: 'Activas', value: '1 842', delta: '+64 este mes', tone: 'pos' as const },
  { label: 'Churn 30 d', value: '2.4 %', delta: '−0.3 pts', tone: 'pos' as const },
  { label: 'Pagos fallidos', value: '9', delta: '$224 en riesgo', tone: 'neg' as const },
];

export const subs: {
  name: string;
  email: string;
  plan: string;
  price: string;
  next: string;
  badge: string;
  tone: BadgeTone;
  action: string;
}[] = (
  [
    ['Ana Robles', 'ana.robles@gmail.com', 'Mensual', '$14.00', '12 ago', 'active', 'Ver'],
    ['Bruno Sáez', 'bruno.saez@outlook.com', 'Mensual', '$9.00', '3 ago', 'past_due', 'Reintentar'],
    ['Carla Núñez', 'carla.n@icloud.com', 'Anual', '$120.00', '2 mar', 'active', 'Ver'],
    ['Diego Marín', 'diego.marin@gmail.com', 'Mensual', '$0.00', '—', 'trialing', 'Ver'],
    ['Elena Prat', 'elena.prat@gmail.com', 'Mensual', '$14.00', '18 ago', 'active', 'Ver'],
    ['Félix Duarte', 'felix.d@proton.me', 'Mensual', '$14.00', '—', 'paused', 'Reanudar'],
    ['Gala Ferrer', 'gala.ferrer@gmail.com', 'Anual', '$120.00', '9 nov', 'active', 'Ver'],
    ['Hugo Belmonte', 'hugo.b@gmail.com', 'Mensual', '$11.00', '—', 'canceled', 'Ver'],
  ] as const
).map(([name, email, plan, price, next, tone, action]) => ({
  name,
  email,
  plan,
  price,
  next,
  action,
  badge: BADGE_LABEL[tone as BadgeTone] ?? tone,
  tone: tone as BadgeTone,
}));

// --- Reportes ----------------------------------------------------------------
export const reportStats = [
  { label: 'Ingresos 12 m', value: '$412k', delta: '+18 % interanual', tone: 'pos' as const },
  { label: 'MRR', value: '$38 420', delta: '+5.2 % vs. junio', tone: 'pos' as const },
  { label: 'ARPU', value: '$20.8', delta: '+$0.6', tone: 'pos' as const },
  { label: 'Churn 30 d', value: '2.4 %', delta: '−0.3 pts', tone: 'pos' as const },
];

export const revenue = [
  { m: 'Ago', v: 62 },
  { m: 'Sep', v: 68 },
  { m: 'Oct', v: 71 },
  { m: 'Nov', v: 74 },
  { m: 'Dic', v: 83 },
  { m: 'Ene', v: 79 },
  { m: 'Feb', v: 85 },
  { m: 'Mar', v: 90 },
  { m: 'Abr', v: 88 },
  { m: 'May', v: 95 },
  { m: 'Jun', v: 97 },
  { m: 'Jul', v: 100 },
];
