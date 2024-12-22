package safe

const roundingThreshold = 0.5

func Int32FromFloat64(f float64) int32 {
	if f >= 0 {
		// Round up for positive numbers
		return int32(f + roundingThreshold)
	}

	// Round down for negative numbers
	return int32(f - roundingThreshold)
}
