import type { User } from '@/proto/api/v1/shared_pb'

import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  consumeRequestError,
  deleteAccount,
  getCurrentUser,
  resetPassword,
  updateUserName,
  updateUserUsername,
} from '@/http/requests'
import posthog from '@/posthog'
import { ResetPasswordRequestSchema } from '@/proto/api/v1/auth_service_pb'
import { clearAccountState } from '@/stores/accountState'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { AppInput } from '@/ui/components/AppInput'
import { AppPasswordInput } from '@/ui/components/AppPasswordInput'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import styles from './AccountSettings.module.css'

const usernamePattern = '[A-Za-z0-9._]+'
const minUsernameLength = 3
const maxUsernameLength = 30

/** Account: who you are on it, how the password is changed, and how to leave. */
export const AccountSettings = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [user, setUser] = useState<User>()
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState({ name: '', username: '' })
  const [saving, setSaving] = useState(false)
  const [detailsError, setDetailsError] = useState<string>()
  const [sendingLink, setSendingLink] = useState(false)
  const [passwordError, setPasswordError] = useState<string>()
  const [deletePassword, setDeletePassword] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    // Deleting the account swaps the signed-in shell for the guest one, which
    // remounts this screen under it before the app has left the settings.
    // There is no longer a user to ask about, and asking for an empty id
    // answers with a validation error the person reads as a failed deletion.
    const { userId } = useAuthStore.getState()
    if (!userId) return

    const response = await getCurrentUser(userId)
    if (!response?.user) {
      setFailed(true)
      return
    }

    setFailed(false)
    setUser(response.user)
    setDraft({ name: response.user.name, username: response.user.username })
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
   * name that already landed: each success is taken as it comes, and the form
   * keeps the draft — including a taken username — with the reason inline, for
   * it to be corrected.
   */
  const saveDetails = async () => {
    if (!user || saving) return

    setSaving(true)
    setDetailsError(undefined)
    let saved = user

    if (draft.name !== user.name) {
      const response = await updateUserName(draft.name)
      if (!response) {
        setDetailsError(consumeRequestError() ?? t('settings.detailsFailed'))
        setSaving(false)
        return
      }
      saved = { ...saved, name: response.user?.name ?? draft.name }
    }

    if (draft.username !== user.username) {
      const response = await updateUserUsername(draft.username)
      if (!response) {
        setDetailsError(consumeRequestError() ?? t('settings.detailsFailed'))
        setUser(saved)
        setSaving(false)
        return
      }
      saved = { ...saved, username: response.user?.username ?? draft.username }
    }

    setUser(saved)
    setSaving(false)
    useToastStore.getState().success(t('profile.profileUpdated'))
  }

  /**
   * Sends the reset link to the address on the account.
   *
   * No new password is typed here on purpose: reaching the mailbox is what
   * proves it is the owner asking, and it is the same journey as forgetting
   * the password — one flow to keep right rather than two.
   */
  const sendResetLink = async () => {
    if (!user || sendingLink) return

    setSendingLink(true)
    setPasswordError(undefined)
    const response = await resetPassword(create(ResetPasswordRequestSchema, { email: user.email }))
    setSendingLink(false)

    if (!response) {
      setPasswordError(consumeRequestError() ?? t('settings.passwordLinkFailed'))
      return
    }

    posthog.capture('password_reset_requested')
    useToastStore.getState().success(t('auth.recovery.linkSent'))
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

  if (failed) return <AppErrorState onRetry={() => void load()} />
  // Still fetching — or the account was just deleted, and the guest shell is
  // swapping in under a screen that no longer has a user to ask about.
  if (!user) return <AppSkeleton />

  // Nothing is saved without pressing save, and there is nothing to save until
  // a field differs — which is what the disabled button and its hint say, so
  // leaving the screen can never lose a change the reader thought was kept.
  const edited = draft.name !== user.name || draft.username !== user.username

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{t('settings.accountIntro')}</p>

      <section className={styles.group} aria-label={t('settings.details')}>
        <h2>{t('settings.details')}</h2>
        <div className={styles.card}>
          {/* Read-only, and said so: the address is what a reset link and every
              notification go to, so its absence here would read as a bug. */}
          <div className={styles.readOnly}>
            <strong>{t('settings.emailAddress')}</strong>
            <p>{user.email}</p>
            <small>{t('settings.emailFixed')}</small>
          </div>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void saveDetails()
            }}
          >
            <AppInput
              id="account-name"
              name="name"
              type="text"
              label={t('auth.name')}
              autoComplete="name"
              required
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <AppInput
              id="account-username"
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
                setDraft((current) => ({ ...current, username: event.target.value.toLowerCase() }))
              }
            />
            {detailsError && <AppInlineError>{detailsError}</AppInlineError>}
            <AppButton
              type="submit"
              colour="primary"
              size="lg"
              disabled={!edited || saving}
              aria-busy={saving || undefined}
            >
              {t('common.saveChanges')}
            </AppButton>
            {!edited && <p className={styles.hint}>{t('settings.nothingToSave')}</p>}
          </form>
        </div>
      </section>

      <section className={styles.group} aria-label={t('settings.password')}>
        <h2>{t('settings.password')}</h2>
        <div className={styles.card}>
          <div className={styles.actionRow}>
            {/* No title on the row: the group above it is already the word
                Password, and saying it twice is a stutter. */}
            <p>{t('settings.passwordBody', { email: user.email })}</p>
            {passwordError && <AppInlineError>{passwordError}</AppInlineError>}
            <AppButton
              type="button"
              colour="secondary"
              size="sm"
              width="auto"
              disabled={sendingLink}
              aria-busy={sendingLink || undefined}
              onClick={() => void sendResetLink()}
            >
              {sendingLink ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
            </AppButton>
          </div>
        </div>
      </section>

      {/* Deleting sits under its own heading, away from the fields that are
          changed and changed back. Both app stores require an account made in
          the app to be deletable from inside it, which is why it is here at
          all rather than behind a support address. */}
      <section className={styles.group} aria-label={t('profile.dangerZone')}>
        <h2>{t('profile.dangerZone')}</h2>
        <div className={styles.card}>
          <div className={styles.actionRow}>
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
