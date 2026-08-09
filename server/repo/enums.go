package repo

import (
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

// Bob names enum types and values after the schema-qualified Postgres type,
// which reads poorly at call sites (GetstrongerEventTopicFolloweduser). These
// aliases keep the domain vocabulary readable; they are the only names the rest
// of the server should use.
type (
	EventTopic       = enums.GetstrongerEventTopic
	NotificationType = enums.GetstrongerNotificationType
)

const (
	EventTopicFollowedUser         = enums.GetstrongerEventTopicFolloweduser
	EventTopicRequestTraced        = enums.GetstrongerEventTopicRequesttraced
	EventTopicWorkoutCommentPosted = enums.GetstrongerEventTopicWorkoutcommentposted

	NotificationTypeFollow         = enums.GetstrongerNotificationTypeFollow
	NotificationTypeWorkoutComment = enums.GetstrongerNotificationTypeWorkoutcomment
)
