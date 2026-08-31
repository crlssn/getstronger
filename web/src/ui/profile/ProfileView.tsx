import type { User } from '@/proto/api/v1/shared_pb'

import { BellIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getCurrentUser, updateUserAutofillSets } from '@/http/requests'
import { localeNames } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { selectLocale, useLocaleStore } from '@/stores/locale'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { themeLabelKey } from '@/theme'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppListRow } from '@/ui/components/AppListRow'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppPreferenceRow } from '@/ui/components/AppPreferenceRow'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { AppSwitch } from '@/ui/components/AppSwitch'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { handle, initials } from '@/utils/names'
import { formatNumber } from '@/utils/numbers'
import { weightUnitLabel } from '@/utils/weightUnits'
import { usePreferenceSave } from './preferenceSave'
import styles from './ProfileView.module.css'

// Past this the badge is wider than the icon it sits on.
const maxBadgeCount = 99

/** The Me tab: who you are, how you are doing, and what you can change. */
export const ProfileView = () => {
  const { t } = useTranslation()

  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const dashboard = useDashboardStore((state) => state.dashboard)
  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)
  const autofillSets = usePreferencesStore((state) => state.autofillSets)
  const locale = useLocaleStore(selectLocale)
  const theme = useLocaleStore((state) => state.theme)

  const [user, setUser] = useState<User>()
  const [failed, setFailed] = useState(false)

  const { save, saving, failureOn } = usePreferenceSave()

  const load = useCallback(async () => {
    // A deletion on the account screen swaps the signed-in shell for the guest
    // one, which remounts this tab under it. There is no longer a user to ask
    // about, and asking for an empty id answers with a validation error the
    // person reads as a failed deletion.
    const { userId } = useAuthStore.getState()
    if (!userId) return

    const [response] = await Promise.all([
      getCurrentUser(userId),
      useDashboardStore.getState().load(),
      useNotificationStore.getState().refreshUnreadNotifications(),
    ])
    if (!response?.user) {
      setFailed(true)
      return
    }

    setFailed(false)
    setUser(response.user)
    const preferences = usePreferencesStore.getState()
    preferences.setWeightUnit(response.user.weightUnit)
    preferences.setDistanceUnit(response.user.distanceUnit)
    preferences.setAutofillSets(response.user.autofillSets)
  }, [])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
    }
    void initialLoad()
  }, [load])

  // The tab has no list to fall back to, so an unanswered fetch used to leave
  // the whole page pulsating with no way to ask again.
  if (failed) return <AppErrorState onRetry={() => void load()} />
  // Still fetching — or the account was just deleted, and the guest shell is
  // swapping in under a tab that no longer has a user to ask about.
  if (!user) return <AppSkeleton />

  return (
    <div className={styles.profileStack}>
      {/* A tab root opens with its own large title. This one used to open
          straight onto a card, which left it the only tab without one. */}
      <AppPageHeader title={t('profile.heading')} />

      <section className={styles.profileCard}>
        <div className={styles.avatar}>{initials(user.name)}</div>
        <div className="min-w-0">
          {/* One action for the card rather than a pencil per field: two of
              them sat under the tap-target floor, and the one pinned after the
              name squeezed the heading into a column narrow enough to truncate
              it while the card had 90px going spare. */}
          <h2>{user.name}</h2>
          <p className={styles.usernameLine}>{handle(user.username)}</p>
          <p className={styles.email}>{user.email}</p>
          <AppButton
            type="link"
            to="/settings/account"
            colour="ghost"
            size="sm"
            width="auto"
            className={styles.editProfile}
          >
            <PencilSquareIcon className="size-4" aria-hidden="true" /> {t('profile.editProfile')}
          </AppButton>
        </div>
        {/* The same square the search and the overflow menu are. It was the
            one control in the app with no container at all — a bare glyph with
            a red disc on it — and the count it carries belongs in its name,
            not only in the colour. */}
        <span className={styles.notificationSlot}>
          <AppIconButton
            icon={BellIcon}
            label={
              unreadCount > 0
                ? t('profile.notificationsUnread', { count: unreadCount })
                : t('profile.notifications')
            }
            to="/notifications"
            tone="raised"
          />
          {unreadCount > 0 && (
            <span className={styles.notificationBadge} aria-hidden="true">
              {unreadCount > maxBadgeCount ? `${maxBadgeCount}+` : unreadCount}
            </span>
          )}
        </span>
      </section>

      <section className={styles.statsStrip} aria-label={t('profile.trainingSummary')}>
        <article>
          {/* The lifetime total, not recentWorkouts.length — that list is a
              three-workout preview. */}
          <strong>{formatNumber(dashboard?.workoutCount ?? 0)}</strong>
          <small>{t('profile.workouts')}</small>
        </article>
        <article>
          <strong>{formatNumber(dashboard?.personalBests.length ?? 0)}</strong>
          <small>{t('profile.records')}</small>
        </article>
        <article>
          <strong>
            {formatNumber(dashboard?.volumeThisWeek ?? 0)} {t('common.kg')}
          </strong>
          <small>{t('profile.thisWeek')}</small>
        </article>
      </section>

      <ul className={styles.settingsList}>
        <AppListRow to="/progress" title={t('profile.progress')} meta={t('profile.progressBody')} />
        <AppListRow
          to={`/users/${user.id}`}
          title={t('profile.publicProfile')}
          meta={t('profile.publicProfileBody')}
        />
        <AppListRow
          to="/privacy"
          title={t('profile.privacyPolicy')}
          meta={t('profile.privacyPolicyBody')}
        />
      </ul>

      {/* Each setting is a screen of its own, and what a row says under its
          name is what that setting is set to — the value nobody should have to
          open anything to read. A description would say less: "kg · km" names
          the units and answers what the screen behind it is for. */}
      <section className={styles.settingsGroup} aria-label={t('settings.section')}>
        <h2>{t('settings.section')}</h2>
        <ul className={styles.settingsList}>
          <AppListRow
            to="/settings/units"
            title={t('settings.units')}
            meta={`${weightUnitLabel(weightUnit)} · ${distanceUnitLabel(distanceUnit)}`}
          />
          <AppListRow
            to="/settings/language"
            title={t('settings.language')}
            meta={localeNames[locale]}
          />
          {/* The mode rather than the palette it resolves to: "Device
              appearance" is the setting, and which palette that means today
              is the picker's detail to give. */}
          <AppListRow
            to="/settings/appearance"
            title={t('settings.appearance')}
            meta={t(theme === undefined ? 'settings.appearanceSystem' : themeLabelKey[theme])}
          />
          {/* The one row with no value to show: the card at the top of the tab
              is already the name, the username and the address it would
              repeat, so this says what is behind it instead. */}
          <AppListRow
            to="/settings/account"
            title={t('settings.account')}
            meta={t('settings.accountBody')}
          />

          {/* A boolean is a switch, not an Off/On segmented: two segments
              spelling out a yes and a no is a control wearing the costume of a
              choice between things. One tap, so it stays on the row rather
              than behind a screen of its own. */}
          <li>
            <AppPreferenceRow
              title={t('profile.autofillSets')}
              body={t('profile.autofillSetsBody')}
              error={failureOn('autofill')}
              control={
                <AppSwitch
                  checked={autofillSets}
                  disabled={saving('autofill')}
                  label={t('profile.autofillSets')}
                  onChange={(enabled) =>
                    void save(
                      'autofill',
                      autofillSets,
                      enabled,
                      usePreferencesStore.getState().setAutofillSets,
                      () => updateUserAutofillSets(enabled),
                      {
                        updated: t('profile.autofillSetsUpdated'),
                        failed: t('profile.autofillSetsUpdateFailed'),
                      },
                    )
                  }
                />
              }
            />
          </li>
        </ul>
      </section>

      {/* Logging out is not a setting: it is the one thing on this tab done in
          a single tap, and it stays a row of its own rather than a screen. */}
      <ul className={styles.settingsList}>
        <AppListRow to="/logout" title={t('auth.logout')} meta={t('profile.logoutBody')} />
      </ul>
    </div>
  )
}
