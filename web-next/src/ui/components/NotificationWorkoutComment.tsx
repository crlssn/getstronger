import type { User } from '@/proto/api/v1/shared_pb'
import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

import { RichMessage } from '@/i18n/RichMessage'
import { useAuthStore } from '@/stores/auth'
import { formatUnixToRelativeDateTime } from '@/utils/datetime'

interface Props {
  actor?: User
  timestamp: bigint
  workout?: Workout
}

/** A "someone commented" row, linking to the workout they commented on. */
export const NotificationWorkoutComment = ({ actor, timestamp, workout }: Props) => {
  const userId = useAuthStore((state) => state.userId)

  // The owner changes the sentence, not just a word ("din"/"sin" bind to the
  // noun in Swedish), so each ownership case is a complete message.
  const messageKey =
    userId === workout?.user?.id
      ? 'notifications.commentedOnYourWorkout'
      : actor?.id === workout?.user?.id
        ? 'notifications.commentedOnTheirWorkout'
        : 'notifications.commentedOnUsersWorkout'

  return (
    <Link to={`/workouts/${workout?.id}`} className="flex w-full items-center gap-x-3">
      <ChatBubbleLeftRightIcon className="size-7" aria-hidden="true" />
      <div className="w-full font-normal">
        <div>
          <RichMessage
            i18nKey={messageKey}
            values={{ owner: workout?.user?.username }}
            nodes={{
              name: <span className="font-semibold">{actor?.username}</span>,
              workout: <span className="font-semibold">{workout?.name}</span>,
            }}
          />
        </div>
        <p className="text-sm text-text-subtle">{formatUnixToRelativeDateTime(timestamp)}</p>
      </div>
    </Link>
  )
}
