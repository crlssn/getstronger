import type { User } from '@/proto/api/v1/shared_pb'

import { useCallback, useEffect, useState } from 'react'

import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppList } from '@/ui/components/AppList'
import { AppListItemLink } from '@/ui/components/AppListItem'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { handle } from '@/utils/names'

interface Props {
  /** Fetches the people to list; the two tabs differ only in this. */
  fetchUsers: () => Promise<User[] | undefined>
  /** What an empty tab says — followers and followees are empty differently. */
  empty: { title: string; body: string }
}

/** A list of people, each linked to their profile. */
export const UserList = ({ fetchUsers, empty }: Props) => {
  const [users, setUsers] = useState<User[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const fetched = await fetchUsers()
    if (fetched) setUsers(fetched)
    setFailed(!fetched)
  }, [fetchUsers])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
      setLoaded(true)
    }
    void initialLoad()
  }, [load])

  if (!loaded) return <AppSkeleton />
  if (failed) return <AppErrorState onRetry={() => void load()} />
  if (users.length === 0)
    return <AppEmptyState action="none" body={empty.body} title={empty.title} />

  return (
    <AppList>
      {users.map((user) => (
        <AppListItemLink key={user.id} to={`/users/${user.id}`}>
          <span>
            <strong className="block font-medium">{handle(user.username)}</strong>
            <small className="mt-0.5 block text-sm font-normal text-text-subtle">{user.name}</small>
          </span>
        </AppListItemLink>
      ))}
    </AppList>
  )
}
