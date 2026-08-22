import type { User } from '@/proto/api/v1/shared_pb'
import type { ReactNode } from 'react'

import {
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChartBarIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  getCurrentUser,
  updateUserAutofillSets,
  updateUserDistanceUnit,
  updateUserName,
  updateUserUsername,
  updateUserWeightUnit,
} from '@/http/requests'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { cn } from '@/ui/cn'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { handle, initials } from '@/utils/names'
import { formatNumber } from '@/utils/numbers'
import { normalizeWeightUnit } from '@/utils/weightUnits'
import styles from './ProfileView.module.css'

// Past this the badge is wider than the icon it sits on.
const maxBadgeCount = 99

const usernamePattern = '[A-Za-z0-9._]+'
const minUsernameLength = 3
const maxUsernameLength = 30

/** The Me tab: who you are, how you are doing, and what you can change. */
export const ProfileView = () => {
  const { t } = useTranslation()

  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const dashboard = useDashboardStore((state) => state.dashboard)
  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)
  const autofillSets = usePreferencesStore((state) => state.autofillSets)

  const [user, setUser] = useState<User>()
  const [saving, setSaving] = useState<'weight' | 'distance' | 'autofill' | 'name' | 'username'>()
  const [nameDraft, setNameDraft] = useState<string>()
  const [usernameDraft, setUsernameDraft] = useState<string>()

  useEffect(() => {
    const load = async () => {
      const [response] = await Promise.all([
        getCurrentUser(useAuthStore.getState().userId),
        useDashboardStore.getState().load(),
        useNotificationStore.getState().refreshUnreadNotifications(),
      ])
      if (!response?.user) return

      setUser(response.user)
      const preferences = usePreferencesStore.getState()
      preferences.setWeightUnit(response.user.weightUnit)
      preferences.setDistanceUnit(response.user.distanceUnit)
      preferences.setAutofillSets(response.user.autofillSets)
    }
    void load()
  }, [])

  /**
   * Applies a preference straight away, then tells the server.
   *
   * The request helper stays silent for network-level failures (Unavailable,
   * Unknown, Canceled), which is exactly when this reverts — so the revert says
   * why, or the control appears to snap back on its own.
   */
  const savePreference = async <T,>(
    field: 'weight' | 'distance' | 'autofill',
    previous: T,
    next: T,
    apply: (value: T) => void,
    request: () => Promise<unknown>,
    messages: { updated: string; failed: string },
  ) => {
    if (previous === next) return

    apply(next)
    setSaving(field)
    const res = await request()
    setSaving(undefined)

    if (!res) {
      apply(previous)
      useToastStore.getState().error(messages.failed)
      return
    }

    useToastStore.getState().success(messages.updated)
  }

  const saveName = async () => {
    if (!user || nameDraft === undefined || saving === 'name') return

    setSaving('name')
    const res = await updateUserName(nameDraft)
    setSaving(undefined)

    // Failures surface through the request helper's toast, so the sheet stays
    // open for the draft to be corrected.
    if (!res) return

    setUser({ ...user, name: res.user?.name ?? nameDraft })
    setNameDraft(undefined)
    useToastStore.getState().success(t('profile.nameUpdated'))
  }

  const saveUsername = async () => {
    if (!user || usernameDraft === undefined || saving === 'username') return

    setSaving('username')
    const res = await updateUserUsername(usernameDraft)
    setSaving(undefined)

    // Failures — including a taken username — surface through the request
    // helper's toast, so the sheet stays open for the draft to be corrected.
    if (!res) return

    setUser({ ...user, username: res.user?.username ?? usernameDraft })
    setUsernameDraft(undefined)
    useToastStore.getState().success(t('profile.usernameUpdated'))
  }

  if (!user) return <AppSkeleton />

  const preference = <T,>(
    title: string,
    body: string,
    options: { value: T; label: string }[],
    current: T,
    busy: boolean,
    onPick: (value: T) => void,
  ): ReactNode => (
    <section className={styles.preferencesCard}>
      <div>
        <strong>{title}</strong>
        <small>{body}</small>
      </div>
      <div className="segmented" role="group" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={current === option.value}
            className={cn(current === option.value && 'is-selected')}
            disabled={busy}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <div className={styles.profileStack}>
      {/* A tab root opens with its own large title. This one used to open
          straight onto a card, which left it the only tab without one. */}
      <header className={styles.pageIntro}>
        <h1>{t('profile.heading')}</h1>
      </header>

      <section className={styles.profileCard}>
        <div className={styles.avatar}>{initials(user.name)}</div>
        <div className="min-w-0">
          <p className={styles.eyebrow}>{t('profile.account')}</p>
          {/* The name keeps its own heading element, so the pencil beside it
              stays out of the heading's accessible name. */}
          <div className={styles.nameLine}>
            <h2>{user.name}</h2>
            <button
              type="button"
              aria-label={t('profile.editName')}
              onClick={() => setNameDraft(user.name)}
            >
              <PencilSquareIcon aria-hidden="true" />
            </button>
          </div>
          <p className={styles.usernameLine}>
            <span className="truncate">{handle(user.username)}</span>
            <button
              type="button"
              aria-label={t('profile.editUsername')}
              onClick={() => setUsernameDraft(user.username)}
            >
              <PencilSquareIcon aria-hidden="true" />
            </button>
          </p>
          <p>{user.email}</p>
        </div>
        <Link
          to="/notifications"
          className={styles.notificationLink}
          aria-label={t('profile.notifications')}
        >
          <BellIcon aria-hidden="true" />
          {unreadCount > 0 && (
            <span className={styles.notificationBadge}>
              {unreadCount > maxBadgeCount ? `${maxBadgeCount}+` : unreadCount}
            </span>
          )}
        </Link>
      </section>

      <section className={styles.statsStrip} aria-label={t('profile.trainingSummary')}>
        <article>
          <strong>{dashboard?.recentWorkouts.length ?? 0}</strong>
          <small>{t('profile.workouts')}</small>
        </article>
        <article>
          <strong>{dashboard?.personalBests.length ?? 0}</strong>
          <small>{t('profile.records')}</small>
        </article>
        <article>
          <strong>
            {formatNumber(dashboard?.volumeThisWeek ?? 0)} {t('common.kg')}
          </strong>
          <small>{t('profile.thisWeek')}</small>
        </article>
      </section>

      <section className={styles.settingsCard}>
        <Link to="/progress">
          <span className={styles.settingsIcon}>
            <ChartBarIcon aria-hidden="true" />
          </span>
          <span>
            <strong>{t('profile.progress')}</strong>
            <small>{t('profile.progressBody')}</small>
          </span>
          <ChevronRightIcon aria-hidden="true" />
        </Link>
        <Link to={`/users/${user.id}`}>
          <span className={styles.settingsIcon}>
            <UserCircleIcon aria-hidden="true" />
          </span>
          <span>
            <strong>{t('profile.publicProfile')}</strong>
            <small>{t('profile.publicProfileBody')}</small>
          </span>
          <ChevronRightIcon aria-hidden="true" />
        </Link>
      </section>

      {preference(
        t('profile.weightUnit'),
        t('profile.weightUnitBody'),
        [
          { value: WeightUnit.KILOGRAMS, label: t('auth.kilograms') },
          { value: WeightUnit.POUNDS, label: t('auth.pounds') },
        ],
        normalizeWeightUnit(weightUnit),
        saving === 'weight',
        (unit) =>
          void savePreference(
            'weight',
            normalizeWeightUnit(weightUnit),
            unit,
            usePreferencesStore.getState().setWeightUnit,
            () => updateUserWeightUnit(unit),
            {
              updated: t('profile.weightUnitUpdated'),
              failed: t('profile.weightUnitUpdateFailed'),
            },
          ),
      )}

      {preference(
        t('profile.distanceUnit'),
        t('profile.distanceUnitBody'),
        [
          { value: DistanceUnit.KILOMETERS, label: t('auth.kilometers') },
          { value: DistanceUnit.MILES, label: t('auth.miles') },
        ],
        normalizeDistanceUnit(distanceUnit),
        saving === 'distance',
        (unit) =>
          void savePreference(
            'distance',
            normalizeDistanceUnit(distanceUnit),
            unit,
            usePreferencesStore.getState().setDistanceUnit,
            () => updateUserDistanceUnit(unit),
            {
              updated: t('profile.distanceUnitUpdated'),
              failed: t('profile.distanceUnitUpdateFailed'),
            },
          ),
      )}

      {preference(
        t('profile.autofillSets'),
        t('profile.autofillSetsBody'),
        [
          { value: false, label: t('profile.autofillSetsOff') },
          { value: true, label: t('profile.autofillSetsOn') },
        ],
        autofillSets,
        saving === 'autofill',
        (enabled) =>
          void savePreference(
            'autofill',
            autofillSets,
            enabled,
            usePreferencesStore.getState().setAutofillSets,
            () => updateUserAutofillSets(enabled),
            {
              updated: t('profile.autofillSetsUpdated'),
              failed: t('profile.autofillSetsUpdateFailed'),
            },
          ),
      )}

      <Link to="/logout" className={styles.logoutLink}>
        <ArrowRightOnRectangleIcon aria-hidden="true" /> {t('auth.logout')}
      </Link>

      {nameDraft !== undefined && (
        <AppSheet
          title={t('profile.editName')}
          closeLabel={t('common.close')}
          onClose={() => setNameDraft(undefined)}
          actions={
            <SheetAction type="submit" form="name-form" tone="primary" disabled={saving === 'name'}>
              {t('common.save')}
            </SheetAction>
          }
        >
          <form
            id="name-form"
            onSubmit={(event) => {
              event.preventDefault()
              void saveName()
            }}
          >
            <label htmlFor="edit-name" className="auth-label">
              {t('auth.name')}
            </label>
            <input
              id="edit-name"
              name="name"
              type="text"
              autoComplete="name"
              className="auth-input mt-2"
              required
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </form>
        </AppSheet>
      )}

      {usernameDraft !== undefined && (
        <AppSheet
          title={t('profile.editUsername')}
          closeLabel={t('common.close')}
          onClose={() => setUsernameDraft(undefined)}
          actions={
            <SheetAction
              type="submit"
              form="username-form"
              tone="primary"
              disabled={saving === 'username'}
            >
              {t('common.save')}
            </SheetAction>
          }
        >
          <form
            id="username-form"
            onSubmit={(event) => {
              event.preventDefault()
              void saveUsername()
            }}
          >
            <label htmlFor="edit-username" className="auth-label">
              {t('auth.username')}
            </label>
            <p className="mt-1 text-sm text-text-subtle">{t('auth.usernameHelp')}</p>
            <input
              id="edit-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="auth-input mt-2"
              minLength={minUsernameLength}
              maxLength={maxUsernameLength}
              pattern={usernamePattern}
              required
              value={usernameDraft}
              // Usernames are lower-case, so the field settles the case rather
              // than rejecting what was typed.
              onChange={(event) => setUsernameDraft(event.target.value.toLowerCase())}
            />
          </form>
        </AppSheet>
      )}
    </div>
  )
}
