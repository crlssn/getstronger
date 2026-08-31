import type { User } from '@/proto/api/v1/shared_pb'

import { BellIcon, ChevronRightIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { Code, ConnectError } from '@connectrpc/connect'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  consumeRequestError,
  deleteAccount,
  getCurrentUser,
  updateUserAutofillSets,
  updateUserName,
  updateUserUsername,
} from '@/http/requests'
import { clearAccountState } from '@/stores/accountState'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppPasswordInput } from '@/ui/components/AppPasswordInput'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppInput } from '@/ui/components/AppInput'
import { AppListRow } from '@/ui/components/AppListRow'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppPreferenceRow } from '@/ui/components/AppPreferenceRow'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
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

const usernamePattern = '[A-Za-z0-9._]+'
const minUsernameLength = 3
const maxUsernameLength = 30

/** The Me tab: who you are, how you are doing, and what you can change. */
export const ProfileView = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const dashboard = useDashboardStore((state) => state.dashboard)
  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)
  const autofillSets = usePreferencesStore((state) => state.autofillSets)

  const [user, setUser] = useState<User>()
  const [failed, setFailed] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [draft, setDraft] = useState<{ name: string; username: string }>()
  const [deletePassword, setDeletePassword] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()
  const [profileError, setProfileError] = useState<string>()
  const [deleting, setDeleting] = useState(false)

  const { save, saving, failureOn } = usePreferenceSave()

  const load = useCallback(async () => {
    // Deleting the account swaps the signed-in shell for the guest one, which
    // remounts this screen under it before the app has left /profile. There
    // is no longer a user to ask about, and asking for an empty id answers
    // with a validation error the person reads as a failed deletion.
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

  /**
   * Saves whichever of the two fields was changed.
   *
   * They are separate requests, so a refused username must not roll back a
   * name that already landed: the card takes each success as it comes, and the
   * sheet stays open on the failure — including a taken username — saying why
   * inline, for the draft to be corrected.
   */
  const saveProfile = async () => {
    if (!user || !draft || savingProfile) return

    setSavingProfile(true)
    let saved = user

    setProfileError(undefined)
    if (draft.name !== user.name) {
      const res = await updateUserName(draft.name)
      if (!res) {
        setProfileError(consumeRequestError() ?? t('common.somethingWentWrong'))
        setSavingProfile(false)
        return
      }
      saved = { ...saved, name: res.user?.name ?? draft.name }
    }

    if (draft.username !== user.username) {
      const res = await updateUserUsername(draft.username)
      if (!res) {
        setProfileError(consumeRequestError() ?? t('common.somethingWentWrong'))
        setUser(saved)
        setSavingProfile(false)
        return
      }
      saved = { ...saved, username: res.user?.username ?? draft.username }
    }

    setUser(saved)
    setDraft(undefined)
    setSavingProfile(false)
    useToastStore.getState().success(t('profile.profileUpdated'))
  }

  /**
   * Deletes the account, then leaves nothing of it on the device.
   *
   * A wrong password comes back as InvalidArgument and stays on the field:
   * the sheet is the only place the password was typed, so closing it to show
   * a toast would lose the correction.
   */
  const confirmDelete = async () => {
    if (deletePassword === undefined || deleting) return

    setDeleting(true)
    setDeleteError(undefined)
    try {
      await deleteAccount(deletePassword)
    } catch (error) {
      setDeleting(false)
      setDeleteError(
        error instanceof ConnectError && error.code === Code.InvalidArgument
          ? t('profile.deleteAccountWrongPassword')
          : t('profile.deleteAccountFailed'),
      )
      return
    }

    clearAccountState()
    setDeletePassword(undefined)
    setDeleting(false)
    useToastStore.getState().success(t('profile.accountDeleted'))
    void navigate('/login')
  }

  // The tab has no list to fall back to, so an unanswered fetch used to leave
  // the whole page pulsating with no way to ask again.
  if (failed) return <AppErrorState onRetry={() => void load()} />
  // Still fetching — or the account was just deleted, and the guest shell is
  // swapping in under a screen that no longer has a user to ask about.
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
            type="button"
            colour="ghost"
            size="sm"
            width="auto"
            className={styles.editProfile}
            onClick={() => setDraft({ name: user.name, username: user.username })}
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

      {/* The red waits in the button's outline and the confirmation — the row
          it replaced carried three levels of alarm for things done once or
          never. The delete block says its consequence beside its button, the
          one danger pattern the app has.

          Both app stores require an account made in the app to be deletable
          from inside it, which is why deleting sits on the profile rather than
          behind a support email. */}
      <section className={styles.settingsGroup} aria-label={t('profile.accountSection')}>
        <h2>{t('profile.accountSection')}</h2>
        <div className={styles.settingsCard}>
          <Link to="/logout">
            <span>
              <strong>{t('auth.logout')}</strong>
              <small>{t('profile.logoutBody')}</small>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </Link>
          <div className={styles.dangerRow}>
            <span>
              <strong>{t('profile.deleteAccount')}</strong>
              <small>{t('profile.deleteAccountBody')}</small>
            </span>
            <AppButton
              type="button"
              colour="destructive"
              size="sm"
              width="auto"
              className={styles.deleteAccount}
              onClick={() => {
                setDeleteError(undefined)
                setDeletePassword('')
              }}
            >
              {t('profile.deleteAccount')}
            </AppButton>
          </div>
        </div>
      </section>

      {draft !== undefined && (
        <AppSheet
          title={t('profile.editProfileTitle')}
          closeLabel={t('common.close')}
          onClose={() => setDraft(undefined)}
          actions={
            <SheetAction
              type="submit"
              form="profile-form"
              tone="primary"
              disabled={savingProfile}
            >
              {t('common.save')}
            </SheetAction>
          }
        >
          <form
            id="profile-form"
            className={styles.profileForm}
            onSubmit={(event) => {
              event.preventDefault()
              void saveProfile()
            }}
          >
            <AppInput
              id="edit-name"
              name="name"
              type="text"
              label={t('auth.name')}
              autoComplete="name"
              required
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => current && { ...current, name: event.target.value })
              }
            />
            <AppInput
              id="edit-username"
              name="username"
              type="text"
              label={t('auth.username')}
              hint={t('auth.usernameHelp')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              minLength={minUsernameLength}
              maxLength={maxUsernameLength}
              pattern={usernamePattern}
              required
              value={draft.username}
              // Usernames are lower-case, so the field settles the case rather
              // than rejecting what was typed.
              onChange={(event) =>
                setDraft(
                  (current) =>
                    current && { ...current, username: event.target.value.toLowerCase() },
                )
              }
            />
            {profileError && <AppInlineError>{profileError}</AppInlineError>}
          </form>
        </AppSheet>
      )}

      {deletePassword !== undefined && (
        <AppSheet
          title={t('profile.deleteAccountTitle')}
          body={t('profile.deleteAccountWarning')}
          eyebrow={t('profile.dangerZone')}
          eyebrowTone="danger"
          closeLabel={t('common.close')}
          onClose={() => setDeletePassword(undefined)}
          actions={
            <>
              <SheetAction
                type="submit"
                form="delete-account-form"
                tone="danger"
                disabled={deleting}
              >
                {deleting ? t('profile.deleteAccountDeleting') : t('profile.deleteAccountConfirm')}
              </SheetAction>
              <SheetAction tone="tertiary" onClick={() => setDeletePassword(undefined)}>
                {t('common.cancel')}
              </SheetAction>
            </>
          }
        >
          <form
            id="delete-account-form"
            onSubmit={(event) => {
              event.preventDefault()
              void confirmDelete()
            }}
          >
            <AppPasswordInput
              id="delete-account-password"
              name="password"
              label={t('profile.deleteAccountPassword')}
              autoComplete="current-password"
              invalid={deleteError !== undefined}
              required
              value={deletePassword}
              onValueChange={setDeletePassword}
            />
            {deleteError !== undefined && (
              <AppInlineError className="mt-2">{deleteError}</AppInlineError>
            )}
          </form>
        </AppSheet>
      )}
    </div>
  )
}
