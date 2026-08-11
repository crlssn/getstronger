package repo

import (
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

// Keep the domain vocabulary readable at call sites; Bob preserves the database
// enum value casing when it generates Go identifiers.
type (
	EventTopic       = enums.EventTopic
	NotificationType = enums.NotificationType
)

const (
	EventTopicFollowedUser         = enums.EventTopicFolloweduser
	EventTopicRequestTraced        = enums.EventTopicRequesttraced
	EventTopicWorkoutCommentPosted = enums.EventTopicWorkoutcommentposted

	NotificationTypeFollow         = enums.NotificationTypeFollow
	NotificationTypeWorkoutComment = enums.NotificationTypeWorkoutcomment
)
