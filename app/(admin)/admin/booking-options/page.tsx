import { redirect } from 'next/navigation'

// Retired 2026-07-24: schedule + recurring blocks + booking rules now live in
// the consolidated settings area. Kept as a thin redirect for old links.
export default function LegacyBookingOptionsPage() {
  redirect('/admin/settings/availability')
}
