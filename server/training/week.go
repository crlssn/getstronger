package training

import "time"

const (
	daysPerWeek         = 7
	mondayWeekdayOffset = 6
)

// Week is a training week, which starts on a Monday.
type Week struct {
	start time.Time
}

// WeekOf is the training week the given moment falls in.
func WeekOf(moment time.Time) Week {
	dayOffset := (int(moment.Weekday()) + mondayWeekdayOffset) % daysPerWeek
	start := moment.AddDate(0, 0, -dayOffset)

	return Week{start: time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())}
}

// Start is the Monday the week begins on.
func (w Week) Start() time.Time {
	return w.start
}

// Summarise counts the workouts finished within the week and the tonnage and
// ground they added up to, ignoring any workout that finished before the week
// began.
func (w Week) Summarise(workouts []*Workout) WeekSummary {
	var summary WeekSummary
	for _, workout := range workouts {
		if workout.FinishedAt.Before(w.start) {
			continue
		}

		summary.Workouts++
		summary.Volume += TotalVolume(workout.Sets)
		summary.Distance += TotalDistance(workout.Sets)
	}

	return summary
}

// WeekSummary is how much training a week held.
type WeekSummary struct {
	Workouts int32
	Volume   Volume
	Distance Distance
}
