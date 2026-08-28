import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { listFollowers } from '@/http/requests'
import { UserList } from '@/ui/users/UserList'

/** The people following this profile. */
export const UserFollowers = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const fetchUsers = useCallback(async () => (await listFollowers(id))?.followers, [id])

  return (
    <UserList
      empty={{ body: t('profile.followersEmptyBody'), title: t('profile.followersEmptyTitle') }}
      fetchUsers={fetchUsers}
    />
  )
}
