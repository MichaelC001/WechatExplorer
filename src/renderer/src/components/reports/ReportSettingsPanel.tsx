import React, { useState } from 'react'
import type { GeneratedReportRecord } from './types'
import { ReportExportStatus } from './ReportExportStatus'

interface ReportSettingsPanelProps {
  report: GeneratedReportRecord | null
  imageSize: { width: number; height: number } | null
  onReveal: (report: GeneratedReportRecord) => Promise<{ success: boolean; error?: string }>
}

const formatGeneratedAt = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function ReportSettingsPanel({
  report,
  imageSize,
  onReveal
}: ReportSettingsPanelProps): React.ReactElement {
  const [copyStatus, setCopyStatus] = useState('')
  const path = report?.pngPath || report?.htmlPath || ''

  const copyPath = async (): Promise<void> => {
    if (!path) return
    try {
      await navigator.clipboard.writeText(path)
      setCopyStatus('文件路径已复制')
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <aside className="report-settings-panel">
      <header>
        <h2>报告信息</h2>
        <p>当前本地日报资产的真实保存状态</p>
      </header>
      <section className="report-settings-section">
        <h3>生成信息</h3>
        {report ? (
          <div className="report-export-list">
            <div>
              <span>生成时间</span>
              <b>{formatGeneratedAt(report.generatedAt)}</b>
            </div>
            <div>
              <span>消息数量</span>
              <b>{report.messageCount} 条</b>
            </div>
            <div>
              <span>总结范围</span>
              <b>{report.dateRange}</b>
            </div>
          </div>
        ) : (
          <p>尚未选择报告。</p>
        )}
      </section>
      <ReportExportStatus report={report} imageSize={imageSize} onReveal={onReveal} />
      <section className="report-settings-section">
        <h3>文件路径</h3>
        {path ? (
          <>
            <code>{path}</code>
            <button type="button" onClick={() => void copyPath()}>
              复制文件路径
            </button>
            {copyStatus && <p>{copyStatus}</p>}
          </>
        ) : (
          <p>当前报告缺少文件路径。</p>
        )}
      </section>
      <section className="report-settings-section muted">
        <h3>暂未支持</h3>
        <p>云同步、报告编辑器、模板切换和复杂历史数据库不属于本阶段。</p>
      </section>
    </aside>
  )
}
