import Link from 'next/link'

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="booking-route-shell min-h-screen flex flex-col">
      <header className="border-b border-black/10 bg-[#f4efe5]">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
          <Link href="/" className="public-wordmark">
            <span className="public-wordmark__dna">DNA</span><span>my colours</span>
          </Link>
          <Link href="/" className="text-xs uppercase tracking-[0.12em] text-black/55 hover:text-black">
            Return home
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
