import { AppSegmented } from 'getstronger-ds'

export const Default = () => (
  <AppSegmented
    label="Chart range"
    value="4w"
    options={[
      { label: 'Last 7 days', value: '7d' },
      { label: 'Last 4 weeks', value: '4w' },
      { label: 'Last year', value: '1y' },
    ]}
    onChange={() => undefined}
  />
)

export const Compact = () => (
  <AppSegmented
    label="Chart range"
    density="compact"
    value="4W"
    options={[
      { label: '7D', value: '7D' },
      { label: '4W', value: '4W' },
      { label: '1Y', value: '1Y' },
    ]}
    onChange={() => undefined}
  />
)

export const Busy = () => (
  <AppSegmented
    label="Weight unit"
    busy
    value="kg"
    options={[
      { label: 'Kilograms', value: 'kg' },
      { label: 'Pounds', value: 'lb' },
    ]}
    onChange={() => undefined}
  />
)

// A row wider than its container scrolls, and the hidden edge fades out.
export const Overflowing = () => (
  <div style={{ maxWidth: 260 }}>
    <AppSegmented
      label="Measurement"
      value="weight"
      options={[
        { label: 'Weight × reps', value: 'weight' },
        { label: 'Distance × time', value: 'distance' },
        { label: 'Reps only', value: 'reps' },
      ]}
      onChange={() => undefined}
    />
  </div>
)
