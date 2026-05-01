import Link from 'next/link'

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
          <Link href="/" className="text-sm tracking-[0.2em] uppercase">
            Draping
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
