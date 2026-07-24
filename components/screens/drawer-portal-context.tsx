'use client'

// Vendored from protec-portal (2026-07-24 component port), where this context
// lives in components/screens/detail-drawer.tsx (not ported). Overlay shells
// (sheets/drawers) publish a portal container inside their Radix focus trap so
// nested popovers (Select/Combobox content) can portal INSIDE the trap instead
// of to <body>. FilterSheet provides it; draping's ui primitives currently do
// not consume it (harmless), but a future drawer/select can opt in.

import { createContext } from 'react'

export const DrawerPortalContext = createContext<HTMLElement | null>(null)
