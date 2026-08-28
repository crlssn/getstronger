import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { listFollowees } from '@/http/requests'
import { UserList } from '@/ui/users/UserList'

/** The people this profile follows. */
export const UserFollowees = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const fetchUsers = useCallback(async () => (await listFollowees(id))?.followees, [id])

  return (
    <UserList
      empty={{ body: t('profile.followeesEmptyBody'), title: t('profile.followeesEmptyTitle') }}
      fetchUsers={fetchUsers}
    />
  )
}
