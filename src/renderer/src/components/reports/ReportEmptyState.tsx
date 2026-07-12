import React from 'react'

interface ReportEmptyStateProps {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}

export function ReportEmptyState({
  title,
  message,
  actionLabel,
  onAction
}: ReportEmptyStateProps): React.ReactElement {
  return (
    <div className="report-center-empty">
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}
