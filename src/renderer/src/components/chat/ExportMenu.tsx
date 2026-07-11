import React, { useEffect, useRef, useState } from 'react'
import { ArrowDownIcon, ExportIcon } from './icons'

export type ExportRange = number | 'all'

interface ExportMenuProps {
  disabled: boolean
  onExport: (range: ExportRange) => void
}

const EXPORT_OPTIONS: { label: string; value: ExportRange }[] = [
  { label: '导出当前范围', value: 'all' },
  { label: '导出今天', value: 0 },
  { label: '导出昨日', value: 1 },
  { label: '导出近 7 天', value: 7 },
  { label: '导出近 30 天', value: 30 },
  { label: '导出全部', value: 'all' }
]

export function ExportMenu({ disabled, onExport }: ExportMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div className="chat-menu" ref={menuRef}>
      <button
        type="button"
        className="chat-tool-button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={disabled ? '没有可导出的消息' : '导出聊天记录'}
      >
        <ExportIcon />
        <span>导出</span>
        <ArrowDownIcon />
      </button>
      {open && (
        <div className="chat-dropdown-menu">
          {EXPORT_OPTIONS.map((option, index) => (
            <button
              key={`${option.label}-${index}`}
              type="button"
              onClick={() => {
                onExport(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
