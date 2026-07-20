import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'DNA My Colours · Personal colour analysis in Ottawa',
    template: '%s · DNA My Colours',
  },
  description: 'Discover the colours that bring you into focus through personal colour analysis in Ottawa, Ontario.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('h-full antialiased', geistSans.variable, geistMono.variable)}>
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
