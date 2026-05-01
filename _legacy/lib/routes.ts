export type RouteNode = {
  label: string
  children?: RouteTree
}

export type RouteTree = Record<string, RouteNode>

export const ROUTE_TREE: RouteTree = {
  book: { label: 'Book' },
  admin: {
    label: 'Admin',
    children: {
      bookings: { label: 'Bookings', children: { '[id]': { label: 'Booking' } } },
      'service-groups': { label: 'Service Groups', children: { '[id]': { label: 'Edit Group' }, new: { label: 'New Service Group' } } },
      services: { label: 'Services', children: { '[id]': { label: 'Edit Service' }, new: { label: 'New Service' } } },
      offerings: { label: 'Offerings', children: { '[id]': { label: 'Edit Offering' }, new: { label: 'New Offering' } } },
      'email-templates': { label: 'Email', children: { '[id]': { label: 'Edit Template' }, new: { label: 'New Template' } } },
      settings: { label: 'Settings' },
      login: { label: 'Login' },
    },
  },
}
