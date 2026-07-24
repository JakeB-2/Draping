// ---------------------------------------------------------------------------
// Layout vocabulary — TRIMMED vendored barrel (ported from protec-portal,
// 2026-07-24). Only the surfaces draping actually vendored are exported here;
// protec's hub/workspace/dashboard/drawer/form machinery was deliberately not
// ported. Add exports as further pieces are vendored.
//
//   Settings left-nav:  SubSidebarLayout (+ SubSidebarDesktop / SubSidebarMobile)
//   Master-detail:      SplitView + SplitEmptyState + SelectionMemoryMirror
//   Detail pane:        DetailPaneHeader, SectionStack + RowList family
//   Detail page:        DetailShell / DetailScreen / DetailHeader / DetailSection / DetailTabs
//   Cards:              Surface + SectionHeader
//   Paging:             Paginator (default export of ./paginator)
// ---------------------------------------------------------------------------

export {
  SubSidebarLayout,
  SubSidebarDesktop,
  SubSidebarMobile,
  type SubSidebarSection,
  type SubSidebarItem,
} from './sub-sidebar'

export { SplitView } from './split-view'
export { SplitEmptyState } from './split-empty-state'
export { SelectionMemoryMirror } from './selection-memory-mirror'
export {
  useSelectionMemory,
  useTabHref,
  subscribeSelectionMemory,
  getSelectionMemorySnapshot,
} from './use-selection-memory'
export {
  useUrlRowSelection,
  buildRowSelectionUrl,
  buildCreateDrawerUrl,
  buildClearNewUrl,
  type UrlRowSelectionOptions,
} from './use-url-row-selection'

export { default as Paginator } from './paginator'

export { Surface, SectionHeader, type SurfaceProps, type SectionHeaderProps } from './surface'
export { OverlaySurfaceContext, OverlaySurfaceProvider } from './overlay-surface'
export { DetailPaneHeader, useSelectionBackHref, resolveSelectionBackHref } from './detail-pane-header'

export {
  DetailShell,
  DetailScreen,
  DetailHeader,
  DetailSection,
  DetailTabs,
  Section,
  TabbedContent,
  Badge,
  Skeleton,
} from './detail'

export {
  SectionStack,
  SectionStackCollapseAll,
  RowList,
  RowListHeader,
  TieredRowList,
  type RowTierColumn,
  type RowTierRole,
  type TieredRowData,
  RowListAddButton,
  RowListEmpty,
  InlineEditRow,
  InlineEditField,
  InlineEditInput,
  InlineEditActions,
  LinkedRowList,
  LinkedRowItem,
  ActionRowList,
  ActivityRowList,
  MetricRowList,
  ROW_GRID,
  ROW_ACTIONS_TRACK,
  type RowListVariant,
  type LinkedRow,
  type ActionRow,
  type ActivityRow,
  type MetricRow,
} from './row-list'

export { FormSkeleton } from './form-skeleton'
export { deriveFilterOptions, type FilterOption } from './table-utils'
export { DrawerPortalContext } from './drawer-portal-context'
