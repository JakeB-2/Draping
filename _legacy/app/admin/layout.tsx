import AdminBreadcrumbs from '@/components/layout/AdminBreadcrumbs'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminBreadcrumbs />
      {children}
    </>
  )
}
