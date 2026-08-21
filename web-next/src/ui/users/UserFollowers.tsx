import { useCallback } from 'react'
import { useParams } from 'react-router-dom'

import { listFollowers } from '@/http/requests'
import { UserList } from '@/ui/users/UserList'

/** The people following this profile. */
export const UserFollowers = () => {
  const { id = '' } = useParams()

  const fetchUsers = useCallback(async () => (await listFollowers(id))?.followers, [id])

  return <UserList fetchUsers={fetchUsers} />
}
