type HelpContent = { title: string; tips: string[] }

const DEFAULT_HELP: HelpContent = {
  title: 'Need help?',
  tips: ['Use the navigation on the left to move between sections.'],
}

const HELP_MAP: Record<string, HelpContent> = {
  '/admin': {
    title: 'Admin Dashboard',
    tips: ['View upcoming bookings at a glance.', 'Use the sidebar to manage services, offerings, and settings.'],
  },
  '/admin/bookings': {
    title: 'Bookings',
    tips: ['All client bookings appear here.', 'Click a booking to view details.'],
  },
  '/admin/services': {
    title: 'Services',
    tips: ['Services are the atomic units that make up offerings.', 'Each service belongs to a service group.'],
  },
  '/admin/offerings': {
    title: 'Offerings',
    tips: ['Offerings are the sellable packages clients can book.', 'Each offering is made up of one or more services.'],
  },
  '/admin/settings': {
    title: 'Settings',
    tips: ['Configure business hours, break rules, and availability constraints here.'],
  },
  '/book': {
    title: 'Book an Appointment',
    tips: ['Fill in your details, choose a service, then pick a date and time.'],
  },
}

export function getHelpContent(pathname: string): HelpContent {
  return HELP_MAP[pathname] ?? DEFAULT_HELP
}
