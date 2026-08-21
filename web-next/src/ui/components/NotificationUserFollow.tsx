import type { User } from '@/proto/api/v1/shared_pb'

import { UserPlusIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

import { RichMessage } from '@/i18n/RichMessage'
import { formatUnixToRelativeDateTime } from '@/utils/datetime'
import { handle } from '@/utils/names'

interface Props {
  actor?: User
  timestamp: bigint
}

/** A "someone followed you" row, linking to whoever did. */
export const NotificationUserFollow = ({ actor, timestamp }: Props) => (
  <Link to={`/users/${actor?.id}`} className="flex w-full items-center gap-x-3">
    <UserPlusIcon className="size-7" aria-hidden="true" />
    <div className="w-full">
      <div>
        <RichMessage
          i18nKey="notifications.followedYou"
          nodes={{ name: <span className="font-semibold">{handle(actor?.username)}</span> }}
        />
      </div>
      <p className="text-sm text-text-subtle">{formatUnixToRelativeDateTime(timestamp)}</p>
    </div>
  </Link>
)
