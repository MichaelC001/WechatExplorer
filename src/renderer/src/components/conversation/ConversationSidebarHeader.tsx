import React from 'react'
import { ConversationSearch } from './ConversationSearch'
import { DateRangeSelector } from './DateRangeSelector'

interface ConversationSidebarHeaderProps {
  totalCount: number
  searchValue: string
  dateRange: string
  onSearchChange: (value: string) => void
  onDateRangeChange: (range: string) => void
}

export function ConversationSidebarHeader({
  totalCount,
  searchValue,
  dateRange,
  onSearchChange,
  onDateRangeChange
}: ConversationSidebarHeaderProps): React.ReactElement {
  return (
    <div className="conversation-sidebar-header">
      <div className="conversation-sidebar-title-row">
        <h2>聊天档案</h2>
        <span>{totalCount} 个会话</span>
      </div>
      <ConversationSearch value={searchValue} onChange={onSearchChange} />
      <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
    </div>
  )
}
