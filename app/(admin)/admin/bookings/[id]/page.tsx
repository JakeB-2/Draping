// The standalone booking-detail route is kept alive for old links and emails,
// but the detail view now lives in the /admin/bookings SplitView pane — so this
// route simply forwards into it as ?selected=<id>.

import { redirect } from 'next/navigation'

export default async function BookingDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/bookings?selected=${id}`)
}
