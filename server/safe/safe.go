package safe

const roundingThreshold = 0.5

const (
	maxInt32 = 1<<31 - 1
	minInt32 = -1 << 31
)

func Int32FromInt(value int) int32 {
	if value > maxInt32 {
		return maxInt32
	}
	if value < minInt32 {
		return minInt32
	}

	return int32(value)
}

func Int32FromFloat64(f float64) int32 {
	if f >= 0 {
		// Round up for positive numbers
		return int32(f + roundingThreshold)
	}

	// Round down for negative numbers
	return int32(f - roundingThreshold)
}
