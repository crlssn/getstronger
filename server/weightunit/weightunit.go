package weightunit

import "math"

type Unit string

const (
	Kilograms Unit = "kg"
	Pounds    Unit = "lb"

	kilogramsPerPound = 0.45359237
	decimalScale      = 100
)

func Normalize(unit string) Unit {
	if Unit(unit) == Pounds {
		return Pounds
	}

	return Kilograms
}

// ToKilograms converts an entered weight to the database's canonical unit.
func ToKilograms(weight float64, unit string) float64 {
	if Normalize(unit) == Pounds {
		return roundToHundredths(weight * kilogramsPerPound)
	}

	return weight
}

// FromKilograms restores the value in the unit used when the set was entered.
func FromKilograms(weight float64, unit string) float64 {
	if Normalize(unit) == Pounds {
		return roundToHundredths(weight / kilogramsPerPound)
	}

	return weight
}

func roundToHundredths(value float64) float64 {
	return math.Round(value*decimalScale) / decimalScale
}
