import React from 'react'
import {
  SUMMARY_DATE_OPTIONS,
  SummaryDateRange
} from '../../utils/group-report'
import { RangeMessageState } from '../../hooks/useGroupReportGeneration'

interface ReportRangeSelectorProps {
  value: SummaryDateRange
  messageCount: number
  rangeState: RangeMessageState
  disabled: boolean
  onChange: (value: SummaryDateRange) => void
}

export function ReportRangeSelector({
  value,
  messageCount,
  rangeState,
  disabled,
  onChange
}: ReportRangeSelectorProps): React.ReactElement {
  const countText =
    rangeState.status === 'loading'
      ? '正在计算'
      : rangeState.status === 'error'
        ? rangeState.error
        : `${messageCount} 条消息`

  return (
    <section className="report-config-section">
      <div className="report-section-heading">
        <h3>总结范围</h3>
        <span className={rangeState.status === 'error' ? 'danger' : ''}>{countText}</span>
      </div>
      <div className="report-range-options">
        {SUMMARY_DATE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'active' : ''}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
        <button type="button" disabled title="当前业务尚未支持自定义开始和结束时间">
          自定义 <span>即将支持</span>
        </button>
      </div>
    </section>
  )
}
