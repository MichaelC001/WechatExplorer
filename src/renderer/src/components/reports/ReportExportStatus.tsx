import React from 'react'
import type { GeneratedReportRecord } from './types'

interface ReportExportStatusProps {
  report: GeneratedReportRecord | null
  onReveal: (report: GeneratedReportRecord) => Promise<{ success: boolean; error?: string }>
}

export function ReportExportStatus({
  report,
  onReveal
}: ReportExportStatusProps): React.ReactElement {
  const [status, setStatus] = React.useState('')

  if (!report) {
    return (
      <section className="report-settings-section">
        <h3>导出状态</h3>
        <p>尚未选择报告。</p>
      </section>
    )
  }

  const handleReveal = async (): Promise<void> => {
    const result = await onReveal(report)
    setStatus(result.success ? '已打开报告所在文件夹' : result.error || '打开文件夹失败')
  }

  return (
    <section className="report-settings-section">
      <h3>导出状态</h3>
      <div className="report-export-list">
        <div>
          <span>HTML</span>
          <b>{report.htmlStatus === 'ready' ? '已保存' : '缺失'}</b>
        </div>
        <div>
          <span>PNG 长图</span>
          <b>{report.pngStatus === 'ready' ? '已保存' : '缺失'}</b>
        </div>
        {report.imageSize && (
          <div>
            <span>图片尺寸</span>
            <b>
              {report.imageSize.width} x {report.imageSize.height}
            </b>
          </div>
        )}
      </div>
      {(report.pngPath || report.htmlPath) && (
        <button type="button" onClick={() => void handleReveal()}>
          打开文件夹
        </button>
      )}
      {status && <p>{status}</p>}
    </section>
  )
}
