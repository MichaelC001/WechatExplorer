import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { GeneratedReportRecord } from './types'
import { ReportEmptyState } from './ReportEmptyState'
import { ReportToolbar } from './ReportToolbar'
import { ReportZoomBar } from './ReportZoomBar'

interface ReportViewerProps {
  report: GeneratedReportRecord | null
  onBackToConfigure: () => void
  onRegenerate: () => void
  onCopyImage: (report: GeneratedReportRecord) => Promise<{ success: boolean; error?: string }>
  onReveal: (report: GeneratedReportRecord) => Promise<{ success: boolean; error?: string }>
  onImageSizeChange: (size: { width: number; height: number } | null) => void
}

export function ReportViewer({
  report,
  onBackToConfigure,
  onRegenerate,
  onCopyImage,
  onReveal,
  onImageSizeChange
}: ReportViewerProps): React.ReactElement {
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('')
  const [imageError, setImageError] = useState('')
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setStatus('')
      setImageError('')
      setZoom(1)
      setNaturalSize(null)
      onImageSizeChange(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [onImageSizeChange, report?.id])

  const title = useMemo(
    () => (report ? `${report.contactName} 群聊日报` : 'AI 群聊日报'),
    [report]
  )

  const fitWidth = (): void => {
    const viewport = viewportRef.current
    if (!viewport || !naturalSize?.width) return
    const nextZoom = Math.min(2, Math.max(0.25, (viewport.clientWidth - 48) / naturalSize.width))
    setZoom(Number(nextZoom.toFixed(2)))
  }

  const handleCopy = async (): Promise<void> => {
    if (!report) return
    const result = await onCopyImage(report)
    setStatus(result.success ? '图片已复制' : result.error || '复制图片失败')
  }

  const handleReveal = async (): Promise<void> => {
    if (!report) return
    const result = await onReveal(report)
    setStatus(result.success ? '已打开报告所在文件夹' : result.error || '打开文件夹失败')
  }

  if (!report) {
    return (
      <main className="report-viewer">
        <ReportEmptyState
          title="尚未生成日报"
          message="生成一份 AI 群聊日报后，可以在这里查看本地保存的长图。"
          actionLabel="生成新日报"
          onAction={onBackToConfigure}
        />
      </main>
    )
  }

  return (
    <main className="report-viewer">
      <header className="report-viewer-header">
        <div>
          <h1>{title}</h1>
          <p>
            {report.dateRange} · 基于 {report.messageCount} 条消息生成 · AI 生成内容，请核对重要信息
          </p>
        </div>
        <ReportToolbar
          canCopyImage={Boolean(report.generatedImage)}
          canReveal={Boolean(report.pngPath || report.htmlPath)}
          onRegenerate={onRegenerate}
          onCopyImage={() => void handleCopy()}
          onReveal={() => void handleReveal()}
        />
      </header>
      {status && <div className="report-viewer-status">{status}</div>}
      <div className="report-viewer-stage" ref={viewportRef}>
        {report.generatedImage && !imageError ? (
          <div className="report-canvas">
            <img
              src={report.generatedImage}
              alt={title}
              style={{
                width: naturalSize ? `${Math.round(naturalSize.width * zoom)}px` : undefined
              }}
              onLoad={(event) => {
                const image = event.currentTarget
                const size = {
                  width: image.naturalWidth,
                  height: image.naturalHeight
                }
                setNaturalSize(size)
                onImageSizeChange(size)
              }}
              onError={() => {
                setImageError('日报图片加载失败')
                onImageSizeChange(null)
              }}
            />
          </div>
        ) : (
          <ReportEmptyState
            title={imageError || '暂无 PNG 预览'}
            message={
              report.htmlPath
                ? 'HTML 已保存，可以打开文件夹查看报告文件。'
                : '当前记录没有可预览的报告文件。'
            }
            actionLabel="返回配置"
            onAction={onBackToConfigure}
          />
        )}
      </div>
      <ReportZoomBar zoom={zoom} onZoomChange={setZoom} onFitWidth={fitWidth} />
    </main>
  )
}
