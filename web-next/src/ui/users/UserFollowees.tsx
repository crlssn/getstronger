import { useCallback } from 'react'
import { useParams } from 'react-router-dom'

import { listFollowees } from '@/http/requests'
import { UserList } from '@/ui/users/UserList'

/** The people this profile follows. */
export const UserFollowees = () => {
  const { id = '' } = useParams()

  const fetchUsers = useCallback(async () => (await listFollowees(id))?.followees, [id])

  return <UserList fetchUsers={fetchUsers} />
}
