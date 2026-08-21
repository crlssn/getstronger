export default function AppTextarea({ placeholder, rows }: { placeholder: string; rows: number }) {
  return (
    <textarea
      className="mb-1 w-full rounded-control border border-ink-border shadow-card focus:border-ink-muted focus:ring-ink-muted sm:text-sm"
      placeholder={placeholder}
      rows={rows}
    />
  )
}
