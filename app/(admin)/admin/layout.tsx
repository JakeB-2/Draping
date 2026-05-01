import Link from 'next/link'
// import { redirect } from 'next/navigation'
// import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/lib/auth/actions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Auth disabled during development — re-enable before production
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // if (!user) redirect('/admin/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="flex items-center justify-between px-6 py-3 max-w-6xl mx-auto w-full">
          <Link href="/admin" className="text-sm tracking-[0.15em] uppercase">
            Draping · Admin
          </Link>
          <nav className="flex items-center gap-3 text-sm flex-wrap justify-end">
            <Link href="/admin/offerings" className="text-muted-foreground hover:text-foreground">Offerings</Link>
            <Link href="/admin/bookings" className="text-muted-foreground hover:text-foreground">Bookings</Link>
            <Link href="/admin/email-templates" className="text-muted-foreground hover:text-foreground">Email</Link>
            <Link href="/admin/files" className="text-muted-foreground hover:text-foreground">Files</Link>
            <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground">Settings</Link>
            <span className="text-muted-foreground">·</span>
            <form action={signOut}>
              <button type="submit" className="text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
