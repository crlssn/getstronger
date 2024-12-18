package safe

import (
	"fmt"
	"math"
)

var errInt32OutOfRange = fmt.Errorf("value is out of range for int32")

func IntToInt32(value int) (int32, error) {
	if value < math.MinInt32 || value > math.MaxInt32 {
		return 0, fmt.Errorf("%w: %d", errInt32OutOfRange, value)
	}
	return int32(value), nil
}
