package distanceunit

import "math"

type Unit string

const (
	Kilometers Unit = "km"
	Miles      Unit = "mi"

	kilometersPerMile = 1.609344
	decimalScale      = 100
)

func Normalize(unit string) Unit {
	if Unit(unit) == Miles {
		return Miles
	}

	return Kilometers
}

// ToKilometers converts an entered distance to the database's canonical unit.
func ToKilometers(distance float64, unit string) float64 {
	if Normalize(unit) == Miles {
		return roundToHundredths(distance * kilometersPerMile)
	}

	return distance
}

// FromKilometers restores the value in the unit used when the set was entered.
func FromKilometers(distance float64, unit string) float64 {
	if Normalize(unit) == Miles {
		return roundToHundredths(distance / kilometersPerMile)
	}

	return distance
}

func roundToHundredths(value float64) float64 {
	return math.Round(value*decimalScale) / decimalScale
}
