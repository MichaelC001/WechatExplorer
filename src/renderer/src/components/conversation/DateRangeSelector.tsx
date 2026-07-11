import React from 'react'

interface DateRangeSelectorProps {
  value: string
  onChange: (range: string) => void
}

const DATE_RANGE_OPTIONS = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨日' },
  { key: '7', label: '7 天' },
  { key: '30', label: '30 天' },
  { key: 'all', label: '全部' }
]

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps): React.ReactElement {
  return (
    <div className="conversation-date-range" aria-label="时间范围">
      {DATE_RANGE_OPTIONS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`conversation-date-range-button ${value === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
