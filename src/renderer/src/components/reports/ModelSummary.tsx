import React from 'react'
import { AiModelConfig } from '../../hooks/useGroupReportGeneration'

interface ModelSummaryProps {
  config: AiModelConfig
  onOpenSettings: () => void
}

const MODEL_OPTIONS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' },
  { value: 'moonshot-v1-8k', label: 'Moonshot V1' }
]

const modelLabel = (model: string): string =>
  MODEL_OPTIONS.find((option) => option.value === model)?.label || model || '未选择模型'

export function ModelSummary({
  config,
  onOpenSettings
}: ModelSummaryProps): React.ReactElement {
  const hasApiKey = Boolean(config.apiKey.trim())
  const hasBaseUrl = Boolean(config.baseURL.trim())
  const statusText = hasApiKey && hasBaseUrl ? '配置正常' : hasApiKey || hasBaseUrl ? '配置不完整' : '尚未配置'

  return (
    <section className="report-config-section">
      <div className="report-model-summary">
        <div>
          <h3>模型配置</h3>
          <p>
            {modelLabel(config.model)} · {statusText}
          </p>
        </div>
        <button type="button" onClick={onOpenSettings}>
          更改模型
        </button>
      </div>
    </section>
  )
}
