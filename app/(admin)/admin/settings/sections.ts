import type { SubSidebarSection } from '@/components/screens/sub-sidebar'

// Sidebar map for the consolidated /admin/settings area. Every settings-ish
// surface lives here — the old scattered routes (/admin/booking-options,
// /admin/bookings/options, the single-page settings form) redirect in.
export const SETTINGS_SECTIONS: SubSidebarSection[] = [
  {
    group: 'Studio',
    items: [
      { label: 'Studio', href: '/admin/settings/studio' },
      { label: 'Timezone', href: '/admin/settings/timezone' },
      { label: 'Checkout tax', href: '/admin/settings/tax' },
      { label: 'Participation', href: '/admin/settings/participation' },
    ],
  },
  {
    group: 'Booking',
    items: [
      { label: 'Availability', href: '/admin/settings/availability' },
      { label: 'Booking options', href: '/admin/settings/booking-options' },
    ],
  },
  {
    group: 'Site',
    items: [
      { label: 'Links', href: '/admin/settings/links' },
      { label: 'Email', href: '/admin/settings/email' },
    ],
  },
]
