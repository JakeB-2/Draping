export type RowActivationKeyEvent = {
  key: string
  target: EventTarget | null
  currentTarget: EventTarget | null
}

/** Row keyboard activation belongs only to the row wrapper itself. Interactive
 * descendants (menus, lock reasons, approve buttons) own their own key events. */
export function isDirectRowActivationKey(event: RowActivationKeyEvent): boolean {
  return event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')
}

export type MobileRightRailGroups = {
  compactAction: boolean
  trailing: boolean
  signals: boolean
}

/** Adaptive vertical distribution for the semantic mobile right rail. */
export function mobileRightRailJustification(groups: MobileRightRailGroups): string {
  const count = Number(groups.compactAction) + Number(groups.trailing) + Number(groups.signals)
  if (count >= 2) return 'justify-between'
  if (groups.compactAction) return 'justify-start'
  return 'justify-center'
}
