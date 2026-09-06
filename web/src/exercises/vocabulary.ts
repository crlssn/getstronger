// Generated from exercises/vocabulary.yaml by `mise run gen:exercises`. Do not edit.

/** The muscle group an entry belongs to: one per file, and every entry leads with it. */
export const exerciseGroups = [
  'arms',
  'back',
  'cardio',
  'chest',
  'core',
  'full-body',
  'glutes',
  'legs',
  'shoulders',
] as const

/** What the movement trains, finer than the group. */
export const muscleTags = [
  'abductors',
  'abs',
  'adductors',
  'biceps',
  'calves',
  'forearms',
  'front-delts',
  'hamstrings',
  'hip-flexors',
  'lats',
  'lower-back',
  'lower-chest',
  'obliques',
  'quadriceps',
  'rear-delts',
  'rhomboids',
  'serratus',
  'side-delts',
  'traps',
  'triceps',
  'upper-chest',
] as const

/** The movement pattern, which is how the library's coverage is measured. */
export const patternTags = [
  'anti-extension',
  'anti-lateral-flexion',
  'anti-rotation',
  'carry',
  'hinge',
  'horizontal-pull',
  'horizontal-push',
  'lunge',
  'rotation',
  'squat',
  'vertical-pull',
  'vertical-push',
] as const

/** How the movement is trained, where that changes what it is for. */
export const qualityTags = [
  'bodyweight',
  'compound',
  'conditioning',
  'isolation',
  'isometric',
  'olympic',
  'plyometric',
  'unilateral',
] as const

/** Every tag an entry may carry. */
export const exerciseTags = [
  ...exerciseGroups,
  ...muscleTags,
  ...patternTags,
  ...qualityTags,
] as const

export type ExerciseTag = (typeof exerciseTags)[number]

/** What the movement is performed with. Read by nothing outside the library yet. */
export const exerciseEquipment = [
  'ab-wheel',
  'air-bike',
  'band',
  'barbell',
  'battle-ropes',
  'bench',
  'bodyweight',
  'box',
  'cable',
  'decline-bench',
  'dip-bars',
  'dumbbell',
  'elliptical',
  'ez-bar',
  'glute-ham-bench',
  'hyperextension-bench',
  'incline-bench',
  'jump-rope',
  'kettlebell',
  'landmine',
  'machine',
  'medicine-ball',
  'plate',
  'preacher-bench',
  'pull-up-bar',
  'rings',
  'rower',
  'sandbag',
  'ski-erg',
  'sled',
  'smith-machine',
  'squat-rack',
  'stability-ball',
  'stair-climber',
  'stationary-bike',
  'suspension-trainer',
  'trap-bar',
  'treadmill',
  'weight-vest',
] as const

export type ExerciseEquipment = (typeof exerciseEquipment)[number]

/** The metric names YAML writes, each of which compiles to an ExerciseMetric. */
export const exerciseMetricNames = ['weight', 'reps', 'distance', 'time'] as const
