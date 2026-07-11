import React from 'react'

export function ReportDensitySelector(): React.ReactElement {
  return (
    <section className="report-config-section">
      <div className="report-section-heading">
        <h3>内容密度</h3>
        <span>当前提示词使用标准密度</span>
      </div>
      <div className="report-density-options">
        <button type="button" disabled>
          简洁 <span>即将支持</span>
        </button>
        <button type="button" className="active" disabled>
          标准 <span>当前固定模式</span>
        </button>
        <button type="button" disabled>
          深度 <span>即将支持</span>
        </button>
      </div>
    </section>
  )
}
