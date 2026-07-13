import React from 'react'
import { AiModelConfig } from '../../hooks/useGroupReportGeneration'

interface ModelSummaryProps {
  config: AiModelConfig
  onOpenSettings: () => void
}

export function ModelSummary({ config, onOpenSettings }: ModelSummaryProps): React.ReactElement {
  const statusText = config.configured ? '配置正常' : '尚未配置'

  return (
    <section className="report-config-section">
      <div className="report-model-summary">
        <div>
          <h3>模型配置</h3>
          <p>
            {config.modelName || config.model || '未选择模型'} · {statusText}
          </p>
        </div>
        <button type="button" onClick={onOpenSettings}>
          更改模型
        </button>
      </div>
    </section>
  )
}
