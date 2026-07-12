import React, { useEffect, useRef, useState } from 'react'

interface ReportToolbarProps {
  canCopyImage: boolean
  canReveal: boolean
  onRegenerate: () => void
  onCopyImage: () => void
  onReveal: () => void
}

export function ReportToolbar({
  canCopyImage,
  canReveal,
  onRegenerate,
  onCopyImage,
  onReveal
}: ReportToolbarProps): React.ReactElement {
  const [moreOpen, setMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [moreOpen])

  return (
    <div className="report-viewer-toolbar">
      <button type="button" onClick={onRegenerate}>
        重新生成
      </button>
      <button type="button" disabled={!canCopyImage} onClick={onCopyImage}>
        复制图片
      </button>
      <button type="button" className="primary" disabled={!canReveal} onClick={onReveal}>
        打开报告
      </button>
      <div className="report-more-menu" ref={menuRef}>
        <button type="button" onClick={() => setMoreOpen((open) => !open)}>
          更多
        </button>
        {moreOpen && (
          <div className="report-more-popover">
            <button
              type="button"
              disabled={!canReveal}
              onClick={() => {
                setMoreOpen(false)
                onReveal()
              }}
            >
              打开文件夹
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
