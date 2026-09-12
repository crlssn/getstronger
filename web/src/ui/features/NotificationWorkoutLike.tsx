import type { User } from '@/proto/api/v1/shared_pb'
import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { HandThumbUpIcon } from '@heroicons/react/24/outline'

import { RichMessage } from '@/i18n/RichMessage'
import { NotificationRow } from '@/ui/features/NotificationRow'
import { formatUnixTimestamp } from '@/utils/datetime'
import { handle } from '@/utils/names'

interface Props {
  actor?: User
  timestamp: bigint
  workout?: Workout
  read: boolean
  onOpen: () => void
}

/**
 * A "someone repped your workout" row, linking to the workout they repped.
 *
 * One sentence where the comment row needs three: only the owner is ever
 * notified, so the workout is always theirs.
 */
export const NotificationWorkoutLike = ({ actor, timestamp, workout, read, onOpen }: Props) => (
  <NotificationRow
    icon={<HandThumbUpIcon />}
    read={read}
    to={`/workouts/${workout?.id}`}
    when={formatUnixTimestamp(timestamp)}
    onOpen={onOpen}
  >
    <RichMessage
      i18nKey="notifications.reppedYourWorkout"
      nodes={{
        name: <span className="font-semibold">{handle(actor?.username)}</span>,
        workout: <span className="font-semibold">{workout?.name}</span>,
      }}
    />
  </NotificationRow>
)
