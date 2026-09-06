import type { AppLocale } from '@/i18n'
import type { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import type { ExerciseEquipment, ExerciseTag } from '@/exercises/vocabulary'

/**
 * An entry of the exercise library, compiled from `exercises/*.yaml`.
 *
 * English is the only name every entry has: a locale the library has not been
 * translated into yet falls back to it rather than blocking the release.
 */
export interface LibraryExercise {
  /** Stable across renames, which is what lets an English name be corrected. */
  key: string
  names: { en: string } & Partial<Record<AppLocale, string>>
  metrics: ExerciseMetric[]
  equipment: ExerciseEquipment[]
  tags: ExerciseTag[]
}
