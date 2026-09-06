import type { User } from '@/proto/api/v1/shared_pb'

import { UserPlusIcon } from '@heroicons/react/24/outline'

import { RichMessage } from '@/i18n/RichMessage'
import { NotificationRow } from '@/ui/features/NotificationRow'
import { formatUnixTimestamp } from '@/utils/datetime'
import { handle } from '@/utils/names'

interface Props {
  actor?: User
  timestamp: bigint
  read: boolean
  onOpen: () => void
}

/** A "someone followed you" row, linking to whoever did. */
export const NotificationUserFollow = ({ actor, timestamp, read, onOpen }: Props) => (
  <NotificationRow
    icon={<UserPlusIcon />}
    read={read}
    to={`/users/${actor?.id}`}
    when={formatUnixTimestamp(timestamp)}
    onOpen={onOpen}
  >
    <RichMessage
      i18nKey="notifications.followedYou"
      nodes={{ name: <span className="font-semibold">{handle(actor?.username)}</span> }}
    />
  </NotificationRow>
)
