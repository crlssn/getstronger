import type { ReactNode } from 'react'

export default function AppCard({ children }: { children: ReactNode }) {
  return <div className="card mb-4">{children}</div>
}
