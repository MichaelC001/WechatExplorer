import React from 'react'

interface ReportZoomBarProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  onFitWidth: () => void
}

const clampZoom = (value: number): number => Math.min(2, Math.max(0.25, value))

export function ReportZoomBar({
  zoom,
  onZoomChange,
  onFitWidth
}: ReportZoomBarProps): React.ReactElement {
  return (
    <div className="report-zoom-bar">
      <button type="button" onClick={() => onZoomChange(clampZoom(zoom - 0.1))}>
        缩小
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => onZoomChange(clampZoom(zoom + 0.1))}>
        放大
      </button>
      <button type="button" onClick={onFitWidth}>
        适应宽度
      </button>
    </div>
  )
}
