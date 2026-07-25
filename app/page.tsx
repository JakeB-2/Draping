import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { getPublicBookingCatalog } from '@/app/book/actions'
import { BookingFlow } from '@/app/book/booking-flow'
import { Skeleton } from '@/components/ui/skeleton'
import { getPublicStudioSettings } from '@/lib/public-settings'

const SEASONS = [
  { name: 'Light Spring', color: '#f3ba6b' },
  { name: 'True Spring', color: '#ef704b' },
  { name: 'Bright Spring', color: '#d8cf3d' },
  { name: 'Light Summer', color: '#a6cce0' },
  { name: 'True Summer', color: '#8b94c7' },
  { name: 'Soft Summer', color: '#a88998' },
  { name: 'Soft Autumn', color: '#af8059' },
  { name: 'True Autumn', color: '#bf6b2e' },
  { name: 'Dark Autumn', color: '#56643a' },
  { name: 'Dark Winter', color: '#663753' },
  { name: 'True Winter', color: '#2555a5' },
  { name: 'Bright Winter', color: '#bd1d69' },
]

function SeasonWheel() {
  return (
    <div className="season-wheel" aria-label="The twelve seasonal colour families">
      <div className="season-wheel__center">
        <span>12</span>
        <small>seasons</small>
      </div>
      <div className="season-wheel__orbit" aria-hidden="true">
        {SEASONS.map((season, index) => (
          <span
            key={season.name}
            className="season-wheel__swatch"
            title={season.name}
            style={{
              '--season-index': index,
              '--season-colour': season.color,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

async function HomeContent() {
  await connection()
  const [catalog, settings] = await Promise.all([
    getPublicBookingCatalog(),
    getPublicStudioSettings(),
  ])
  const hasCatalog = catalog.offerings.length > 0
  const firstName = settings.owner_name.split(' ')[0]
  const [wordmarkAccent, ...wordmarkRest] = settings.business_name.split(' ')
  const wordmarkRemainder = wordmarkRest.join(' ')

  return (
    <div className="public-site">
      <header className="public-nav">
        <Link href="#top" className="public-wordmark" aria-label={`${settings.business_name} home`}>
          <span className="public-wordmark__dna">{wordmarkAccent}</span>
          <span>{wordmarkRemainder}</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="#services">Book a session</Link>
          {settings.experience_url && (
            <a href={settings.experience_url} target="_blank" rel="noreferrer">
              The experience <ArrowUpRight aria-hidden="true" />
            </a>
          )}
          {settings.about_url && (
            <a href={settings.about_url} target="_blank" rel="noreferrer">
              About {firstName} <ArrowUpRight aria-hidden="true" />
            </a>
          )}
          {settings.facebook_url && (
            <a href={settings.facebook_url} target="_blank" rel="noreferrer">
              Facebook <ArrowUpRight aria-hidden="true" />
            </a>
          )}
        </nav>
      </header>

      <main id="top">
        <section className="public-hero" aria-labelledby="hero-heading">
          <Image
            src="/dna-colour-drapes-hero.png"
            alt="Twelve richly coloured fabric drapes flowing across an ivory background"
            fill
            priority
            sizes="100vw"
            className="public-hero__image"
          />
          <div className="public-hero__wash" />
          <div className="public-hero__content">
            <p className="public-kicker">Personal colour analysis · {settings.city}</p>
            <h1 id="hero-heading">
              Meet the colours<br />
              that look like <em>you.</em>
            </h1>
            <p className="public-hero__lede">
              A slow, considered exploration of the colours that bring your face into focus—
              and a practical palette for dressing with clarity, ease, and joy.
            </p>
            <div className="public-hero__actions">
              <Link href="#services" className="public-button public-button--ink">
                Find your session <ArrowDown aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="public-hero__signature">
            <span>{settings.city}, {settings.region}</span>
            <span>{settings.credential_label}</span>
          </div>
          <div className="public-hero__index" aria-hidden="true">01 / COLOUR</div>
        </section>

        <section className="public-catalog" id="services" aria-labelledby="services-heading">
          <header className="public-catalog__header">
            <div>
              <p className="public-kicker">The appointment book</p>
              <h2 id="services-heading">Choose your<br /><em>colour experience.</em></h2>
              <p className="public-catalog__lede">
                Pick a session below, tailor who attends, and claim a genuinely open time.
                The exact price and duration always come from the live appointment book.
              </p>
            </div>
            <div className="public-catalog__wheel" aria-hidden="true">
              <SeasonWheel />
            </div>
          </header>

          {hasCatalog ? (
            <BookingFlow catalog={catalog} />
          ) : (
            <div className="public-empty-catalog">
              <span>Catalog coming into colour</span>
              <h3>The new appointment book is taking shape.</h3>
              <p>Services and online booking will appear here as soon as the catalog is published.</p>
              {settings.contact_email && (
                <a href={`mailto:${settings.contact_email}`} className="public-button public-button--ink">
                  Get in touch
                </a>
              )}
            </div>
          )}
        </section>

        <section className="public-about">
          <div className="public-about__colour" aria-hidden="true">
            <Image
              src="/dna-colour-drapes-hero.png"
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, 42vw"
              className="public-about__image"
            />
            <span className="public-about__image-wash" />
          </div>
          <div className="public-about__copy">
            <p className="public-kicker">DNA My Colours</p>
            <h2>Science, perception,<br />and a little bit of magic.</h2>
            <p>
              {settings.owner_name} found personal colour analysis later in life, after seeing her own face
              become more dimensional, radiant, and unmistakably itself in the right colours.
              Today, she offers that same attentive discovery to clients in {settings.city}.
            </p>
            {settings.about_url && (
              <a
                href={settings.about_url}
                target="_blank"
                rel="noreferrer"
                className="public-text-link"
              >
                Read {firstName}&apos;s story <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div>
          <div className="public-wordmark public-wordmark--footer">
            <span className="public-wordmark__dna">{wordmarkAccent}</span><span>{wordmarkRemainder}</span>
          </div>
          <p>Personal colour analysis in {settings.city}, {settings.region}.</p>
        </div>
        <div className="public-footer__links">
          {settings.contact_email && <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>}
          {settings.phone && <a href={`tel:${settings.phone}`}>{settings.phone}</a>}
          {settings.facebook_url && (
            <a href={settings.facebook_url} target="_blank" rel="noreferrer">Facebook</a>
          )}
          <Link href="/admin">Admin</Link>
        </div>
        <p className="public-footer__note">© {new Date().getFullYear()} {settings.business_name}</p>
      </footer>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-[#f5f0e6] p-8">
      <Skeleton className="h-[82vh] w-full rounded-[2rem]" />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}
