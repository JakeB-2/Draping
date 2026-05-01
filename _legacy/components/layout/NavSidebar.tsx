'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/actions/sign-out'
import { CalendarDays, Package, Settings, LogOut, User, BookOpen, Layers, Mail } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HelpButton } from '@/components/layout/HelpButton'

const PUBLIC_NAV = [
  { label: 'Book', href: '/book', icon: CalendarDays },
]

const ADMIN_NAV = [
  { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays },
  { label: 'Service Groups', href: '/admin/service-groups', icon: Layers },
  { label: 'Services', href: '/admin/services', icon: BookOpen },
  { label: 'Offerings', href: '/admin/offerings', icon: Package },
  { label: 'Email', href: '/admin/email-templates', icon: Mail },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function NavSidebar({ name }: { name?: string }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const isAdmin = pathname.startsWith('/admin')

  const navItems = isAdmin ? ADMIN_NAV : PUBLIC_NAV

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="hidden md:flex border-b px-4 py-3">
        <p className="text-sm font-semibold tracking-tight">Draping</p>
      </SidebarHeader>
      <div className="h-[52px] shrink-0 md:hidden" />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href || pathname.startsWith(`${href}/`)}
                  >
                    <Link href={href} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <HelpButton />
          </SidebarMenuItem>
          {name && (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                      {getInitials(name)}
                    </div>
                    <span className="truncate text-sm">{name}</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  className="w-[--radix-dropdown-menu-trigger-width]"
                >
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <User className="size-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
