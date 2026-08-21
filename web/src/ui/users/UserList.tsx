import type { User } from '@/proto/api/v1/shared_pb'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppList } from '@/ui/components/AppList'
import { AppListItem, AppListItemLink } from '@/ui/components/AppListItem'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { handle } from '@/utils/names'

interface Props {
  /** Fetches the people to list; the two tabs differ only in this. */
  fetchUsers: () => Promise<User[] | undefined>
}

/** A list of people, each linked to their profile. */
export const UserList = ({ fetchUsers }: Props) => {
  const { t } = useTranslation()

  const [users, setUsers] = useState<User[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const load = async () => {
      const fetched = await fetchUsers()
      if (fetched) setUsers(fetched)
      setLoaded(true)
    }
    void load()
  }, [fetchUsers])

  if (!loaded) return <AppSkeleton />

  return (
    <AppList>
      {users.length === 0 && <AppListItem>{t('common.nothingHere')}</AppListItem>}
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
