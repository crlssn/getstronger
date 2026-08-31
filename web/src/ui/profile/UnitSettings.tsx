import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { getCurrentUser, updateUserDistanceUnit, updateUserWeightUnit } from '@/http/requests'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { AppPreferenceRow } from '@/ui/components/AppPreferenceRow'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { distanceUnitLabel, normalizeDistanceUnit } from '@/utils/distanceUnits'
import { normalizeWeightUnit, weightUnitLabel } from '@/utils/weightUnits'
import { usePreferenceSave } from './preferenceSave'
import styles from './UnitSettings.module.css'

/** Units: what the app writes every weight and every distance in. */
export const UnitSettings = () => {
  const { t } = useTranslation()

  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)
  const { save, saving, failureOn } = usePreferenceSave()

  // The units are cached on the device, so the page opens on them rather than
  // on a skeleton over something it already knows. The account is still the
  // last word: this refresh replaces the cache when the server answers, and
  // leaves it alone when it cannot be reached.
  const refresh = useCallback(async () => {
    const { userId } = useAuthStore.getState()
    if (!userId) return

    const response = await getCurrentUser(userId)
    if (!response?.user) return

    const preferences = usePreferencesStore.getState()
    preferences.setWeightUnit(response.user.weightUnit)
    preferences.setDistanceUnit(response.user.distanceUnit)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className={styles.stack}>
      {/* A screen pushed onto the Me tab, so the nav bar above carries its
          title; this line says how far a unit reaches instead. */}
      <p className={styles.intro}>{t('settings.unitsIntro')}</p>

      <section className={styles.card}>
        <AppPreferenceRow
          title={t('profile.weightUnit')}
          body={t('profile.weightUnitBody')}
          error={failureOn('weight')}
          control={
            <AppSegmented
              busy={saving('weight')}
              density="compact"
              label={t('profile.weightUnit')}
              options={[
                { value: WeightUnit.KILOGRAMS, label: weightUnitLabel(WeightUnit.KILOGRAMS) },
                { value: WeightUnit.POUNDS, label: weightUnitLabel(WeightUnit.POUNDS) },
              ]}
              value={normalizeWeightUnit(weightUnit)}
              onChange={(unit) =>
                void save(
                  'weight',
                  normalizeWeightUnit(weightUnit),
                  unit,
                  usePreferencesStore.getState().setWeightUnit,
                  () => updateUserWeightUnit(unit),
                  {
                    updated: t('profile.weightUnitUpdated'),
                    failed: t('profile.weightUnitUpdateFailed'),
                  },
                )
              }
            />
          }
        />

        <AppPreferenceRow
          title={t('profile.distanceUnit')}
          body={t('profile.distanceUnitBody')}
          error={failureOn('distance')}
          control={
            <AppSegmented
              busy={saving('distance')}
              density="compact"
              label={t('profile.distanceUnit')}
              options={[
                {
                  value: DistanceUnit.KILOMETERS,
                  label: distanceUnitLabel(DistanceUnit.KILOMETERS),
                },
                { value: DistanceUnit.MILES, label: distanceUnitLabel(DistanceUnit.MILES) },
              ]}
              value={normalizeDistanceUnit(distanceUnit)}
              onChange={(unit) =>
                void save(
                  'distance',
                  normalizeDistanceUnit(distanceUnit),
                  unit,
                  usePreferencesStore.getState().setDistanceUnit,
                  () => updateUserDistanceUnit(unit),
                  {
                    updated: t('profile.distanceUnitUpdated'),
                    failed: t('profile.distanceUnitUpdateFailed'),
                  },
                )
              }
            />
          }
        />
      </section>
    </div>
  )
}
