import { Suspense } from 'react'
// Import the module directly (not the '@/components/screens' barrel): this
// layout is a server component and the barrel re-exports client-only hooks
// (useSyncExternalStore) that would break server-side module evaluation.
import { SubSidebarLayout } from '@/components/screens/sub-sidebar'
import { SETTINGS_SECTIONS } from './sections'

// Shared shell for every /admin/settings/* sub-page: desktop left nav,
// mobile section dropdown. SubSidebarLayout is a client component that reads
// usePathname, so it renders inside Suspense (cacheComponents requirement).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto">
      <Suspense fallback={<div className="min-h-[50vh]" />}>
        <SubSidebarLayout
          title="Settings"
          description="Studio, booking, and site configuration."
          sections={SETTINGS_SECTIONS}
          ariaLabel="Settings sections"
        >
          {children}
        </SubSidebarLayout>
      </Suspense>
    </div>
  )
}
