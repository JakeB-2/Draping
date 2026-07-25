import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { getPublicStudioSettings } from '@/lib/public-settings'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  'use cache'
  const settings = await getPublicStudioSettings()
  return {
    title: {
      default: `${settings.business_name} · Personal colour analysis in ${settings.city}`,
      template: `%s · ${settings.business_name}`,
    },
    description: settings.seo_description
      ?? 'Discover the colours that bring you into focus through personal colour analysis in Ottawa, Ontario.',
  }
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
