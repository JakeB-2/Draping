'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'

export default function MobileHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-2 px-4 py-3 md:hidden border-b bg-muted">
      <SidebarTrigger />
      <p className="text-sm font-semibold tracking-tight">Draping</p>
    </header>
  )
}
