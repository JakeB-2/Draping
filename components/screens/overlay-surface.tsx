'use client'

import * as React from 'react'

// OverlaySurfaceContext — "am I inside an overlay surface?"
//
// True inside any overlay shell that owns its own edge padding: DrawerShell
// (DetailDrawer / FormDrawer), WorkEntryEditorSheet, CompactEditorPopover.
// Page-level surfaces (split-view panes, workspace rails) sit inside the app
// layout's `px-4` phone gutter and are NOT overlays.
//
// Why it exists: SectionStack's phone near-full-bleed default (`-mx-3 md:mx-0`)
// is sized to eat the PAGE gutter. Inside an overlay there is no page gutter to
// eat, so the same negative margin hangs content off the screen edge (the
// "New Work Entry sheet overflows the viewport" class of bug). Overlay shells
// provide this context so the bleed default switches off automatically for any
// stack rendered inside them — no per-call-site `mobileFlush={false}` needed,
// and a future stack dropped into a sheet/drawer can't silently re-break.
export const OverlaySurfaceContext = React.createContext(false)

/** Wrap an overlay shell's children so descendants know they are NOT sitting
 *  in the page gutter (see OverlaySurfaceContext). */
export function OverlaySurfaceProvider({ children }: { children: React.ReactNode }) {
  return <OverlaySurfaceContext.Provider value={true}>{children}</OverlaySurfaceContext.Provider>
}
