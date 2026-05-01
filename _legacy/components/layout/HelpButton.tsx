'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { HelpCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { getHelpContent } from '@/lib/help-content'

export function HelpButton() {
  const pathname = usePathname()
  const help = getHelpContent(pathname)
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton tooltip="Help">
          <HelpCircle />
          <span>Help</span>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 space-y-2">
        <p className="text-sm font-semibold">{help.title}</p>
        <ul className="space-y-1.5">
          {help.tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-0.5 shrink-0 text-foreground/40">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
