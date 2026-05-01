import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center text-center gap-6 px-6 max-w-2xl mx-auto">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Personal colour analysis
        </p>
        <h1 className="text-5xl font-light tracking-tight">Draping</h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Discover the palette that complements your natural undertone, contrast,
          and value.
        </p>
        <Button asChild size="lg" className="mt-4">
          <Link href="/book">Begin booking</Link>
        </Button>
      </main>
      <footer className="py-6 text-center">
        <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground tracking-wide">
          Admin
        </Link>
      </footer>
    </div>
  )
}
