// Booking engine (Phase A foundation) — the ONLY interface Phases B/C
// use for pricing, availability, and booking writes.
//
//   quote / createBookingAtomic / reviseBookingAtomic → engine.ts
//   windows / fits / starts                           → availability.ts
//
// Never insert/update the bookings tables directly, and never compute
// money in JavaScript — the database functions are the authority.

export * from './types.ts'
export { getQuote, createBookingAtomic, reviseBookingAtomic } from './engine.ts'
export { windows, fits, starts, type FitsInput } from './availability.ts'
