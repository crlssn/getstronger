import type { User } from '@/proto/api/v1/shared_pb'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatToRelativeDateTime } from '@/utils/datetime'
import { initials } from '@/utils/names'
import styles from './CardWorkoutComment.module.css'

interface Props {
  comment: string
  timestamp?: Timestamp
  user?: User
}

/** One comment on a workout: who wrote it, when, and what they said. */
export const CardWorkoutComment = ({ comment, timestamp, user }: Props) => {
  const { t } = useTranslation()

  return (
    <article className={styles.commentRow}>
      <Link
        to={`/users/${user?.id}`}
        className={styles.commentAvatar}
        aria-label={t('workout.card.viewProfile', { name: user?.name })}
      >
        {/* The brand's own initials stand in for a name we were not given. */}
        {initials(user?.name) || 'GS'}
      </Link>
      <div className={styles.commentContent}>
        <div className={styles.commentMeta}>
          <Link to={`/users/${user?.id}`}>{user?.username}</Link>
          <time>{formatToRelativeDateTime(timestamp)}</time>
        </div>
        <p>{comment}</p>
      </div>
    </article>
  )
}
