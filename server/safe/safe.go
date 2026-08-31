package safe

import "math"

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

// Int32FromFloat64 rounds a measurement to the 32-bit field reporting it,
// clamped to what that field holds. Go leaves a conversion the target cannot
// represent to the platform, which on amd64 answers with the most negative
// int32 — how a mistyped weight reports a session's tonnage as -2147483648.
func Int32FromFloat64(f float64) int32 {
	// Not a number is no measurement, and neither comparison below would catch
	// it: every comparison against a NaN is false.
	if math.IsNaN(f) {
		return 0
	}

	if f >= 0 {
		// Round up for positive numbers
		rounded := f + roundingThreshold
		if rounded >= maxInt32 {
			return maxInt32
		}

		return int32(rounded)
	}

	// Round down for negative numbers
	rounded := f - roundingThreshold
	if rounded <= minInt32 {
		return minInt32
	}

	return int32(rounded)
}
