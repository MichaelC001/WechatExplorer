import React, { useMemo, useState } from 'react'
import { AccountSummary } from '../account/AccountSummary'
import type { GeneratedReportRecord } from './types'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

interface ReportHistorySidebarProps {
  reports: GeneratedReportRecord[]
  selectedReportId: string | null
  selfInfo: SelfInfo | null
  dbReady: boolean
  onSelectReport: (reportId: string) => void
  onCreateReport: () => void
  onOpenSettings: () => void
}

type HistoryFilter = 'today' | 'yesterday' | 'week' | 'older'

const DAY_MS = 86400000

const dateKey = (value: string): number => {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const formatGeneratedAt = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function ReportHistorySidebar({
  reports,
  selectedReportId,
  selfInfo,
  dbReady,
  onSelectReport,
  onCreateReport,
  onOpenSettings
}: ReportHistorySidebarProps): React.ReactElement {
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<HistoryFilter>('today')

  const filteredReports = useMemo(() => {
    const lower = keyword.trim().toLowerCase()
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - DAY_MS
    const startOfWeek = startOfToday - 6 * DAY_MS

    return reports
      .filter((report) => {
        const haystack = `${report.contactName} ${report.dateRange}`.toLowerCase()
        if (lower && !haystack.includes(lower)) return false
        const time = dateKey(report.generatedAt)
        if (filter === 'today') return time >= startOfToday
        if (filter === 'yesterday') return time >= startOfYesterday && time < startOfToday
        if (filter === 'week') return time >= startOfWeek
        return time < startOfWeek
      })
      .sort((left, right) => dateKey(right.generatedAt) - dateKey(left.generatedAt))
  }, [filter, keyword, reports])

  return (
    <aside className="report-history-sidebar">
      <div className="report-history-header">
        <div>
          <h2>AI 日报</h2>
          <p>本地保存的群聊日报资产</p>
        </div>
        <span>{reports.length}</span>
      </div>
      <label className="report-history-search">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 4 4" />
        </svg>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索群聊或日报"
        />
      </label>
      <div className="report-history-filters">
        {[
          ['today', '今天'],
          ['yesterday', '昨天'],
          ['week', '本周'],
          ['older', '更早']
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value as HistoryFilter)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="report-history-list">
        {filteredReports.length ? (
          filteredReports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={`report-history-item ${report.id === selectedReportId ? 'active' : ''}`}
              onClick={() => onSelectReport(report.id)}
            >
              <span className="report-history-avatar">
                {report.contactAvatar ? (
                  <img src={report.contactAvatar} alt={report.contactName} referrerPolicy="no-referrer" />
                ) : (
                  report.contactName.charAt(0)
                )}
              </span>
              <span className="report-history-text">
                <b>{report.contactName}</b>
                <small>
                  {report.dateRange} · {formatGeneratedAt(report.generatedAt)}
                </small>
                <small>{report.messageCount} 条消息</small>
                <em>
                  HTML {report.htmlStatus === 'ready' ? '已保存' : '缺失'} · PNG{' '}
                  {report.pngStatus === 'ready' ? '已保存' : '缺失'}
                </em>
              </span>
            </button>
          ))
        ) : (
          <div className="report-history-empty">
            <b>当前分组暂无日报</b>
            <button type="button" onClick={onCreateReport}>
              生成新日报
            </button>
          </div>
        )}
      </div>
      <div className="report-history-account">
        <AccountSummary selfInfo={selfInfo} dbReady={dbReady} onClick={onOpenSettings} />
      </div>
    </aside>
  )
}
