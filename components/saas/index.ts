// components/saas 묶음 export — 관리자·포털 공통 부품(계획서 2.1). 화면은 여기서 import한다:
//   import { PageHeader, StatusBadge, useConfirm, toastSuccess, Money } from "@/components/saas"
// 서버 컴포넌트에서 import해도 된다(훅을 쓰는 파일은 모두 "use client"). 부품마다 파일 맨 위에 용도·사용 예가 있다.
// 이 목록의 이름·props는 병렬 단계에서 바꾸지 않는다(추가만).

export { AppProviders } from "./app-providers"
export { PageHeader, SubNav, ContextBar, type BreadcrumbEntry, type SubNavItem } from "./page-header"
export type { HeaderMoreLink } from "./header-actions"
export { StatusBadge, ToneBadge, CountBadge } from "./status-badge"
export { EmptyState, type EmptyKind } from "./empty-state"
export { Notice, Callout, type NoticeTone } from "./notice"
export {
  ConfirmProvider,
  useConfirm,
  ConfirmDialog,
  type ConfirmOptions,
  type ConfirmResult,
  type ConfirmSummaryRow,
} from "./confirm"
export { toastSuccess, toastInfo, type ToastSuccessOptions } from "./toast"
export { ResultCard, type ResultRow, type ResultNextStep } from "./result-card"
export { FilterTabs, type FilterTabOption } from "./filter-tabs"
export { FilterBar, type FilterChip } from "./filter-bar"
export { useUrlState, useUrlStates, type UrlStateMode } from "./use-url-state"
export { BulkActionBar, SelectAllCheckbox } from "./bulk-action-bar"
export { StickyActionBar } from "./sticky-action-bar"
export { Stepper, type StepItem, type StepStatus } from "./stepper"
export { TodoList, StatCard, type TodoItem } from "./todo-list"
export { Money } from "./money"
export { WonInput, UnitInput, type Unit } from "./unit-input"
export { parseUnitValue, formatUnitValue, sanitizeUnitText } from "./unit-input-model"
export { MonthPicker } from "./month-picker"
export { ErrorSummary, useFieldErrors, type FieldErrorItem } from "./form-errors"
export { BusyButton } from "./busy-button"
export { RowActions, type RowActionItem } from "./row-actions"
export { DetailSheet, Highlights, type DetailTab, type HighlightItem } from "./detail-sheet"
export { HelpButton } from "./help-sheet"
export { CopyButton } from "./copy-button"
export { TableSkeleton, CardSkeleton, useDelayedFlag } from "./skeletons"
export { Section } from "./section"
export { SourceTag, type ValueSource } from "./source-tag"
export { SearchCombobox, type ComboItem } from "./search-combobox"
export { FilePreview, PdfPreviewSheet } from "./file-preview"
export { SessionExpiredNotice } from "./session-expired"
