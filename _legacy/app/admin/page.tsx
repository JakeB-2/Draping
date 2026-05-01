import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Package, BookOpen, Settings, Layers } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [{ data: bookings }, { data: offerings }] = await Promise.all([
    supabase.from('bookings').select('id'),
    supabase.from('offerings').select('id').eq('is_active', true),
  ])

  const bookingCount = bookings?.length ?? 0
  const offeringCount = offerings?.length ?? 0

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your bookings and services.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{bookingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Offerings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{offeringCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Bookings', href: '/admin/bookings', icon: CalendarDays, desc: 'View and manage all bookings' },
          { label: 'Service Groups', href: '/admin/service-groups', icon: Layers, desc: 'Define grouping rules for services' },
          { label: 'Services', href: '/admin/services', icon: BookOpen, desc: 'Manage your service catalog' },
          { label: 'Offerings', href: '/admin/offerings', icon: Package, desc: 'Configure sellable packages' },
          { label: 'Settings', href: '/admin/settings', icon: Settings, desc: 'Hours, breaks, and availability' },
        ].map(({ label, href, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base">{label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
