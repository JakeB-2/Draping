// Keep booking configuration outside the dynamic /admin/bookings/[id]
// namespace. The old /admin/bookings/options URL remains available as a
// backwards-compatible route, while admin navigation uses this canonical URL.
export { default } from '../bookings/options/page'
