import React, { useMemo, useState } from 'react'
import { Contact } from '../../../../shared/types'
import {
  AiModelConfig,
  RangeMessageState,
  ReportGenerationPhase,
  ReportPaths
} from '../../hooks/useGroupReportGeneration'
import { SummaryDateRange, SummaryMessageType } from '../../utils/group-report'
import { MessageTypeSelector } from './MessageTypeSelector'
import { ModelSummary } from './ModelSummary'
import { ReportDensitySelector } from './ReportDensitySelector'
import { ReportRangeSelector } from './ReportRangeSelector'
import { ReportSectionSelector } from './ReportSectionSelector'

interface AiReportWorkspaceProps {
  sourceContact: Contact | null
  summaryDateRange: SummaryDateRange
  summaryMessageTypes: SummaryMessageType[]
  modelConfig: AiModelConfig
  rangeMessageCount: number
  reportMessageCount: number
  messageTypeCounts: Record<SummaryMessageType, number>
  rangeState: RangeMessageState
  phase: ReportGenerationPhase
  error: string
  generatedImage: string | null
  reportPaths: ReportPaths | null
  isGenerating: boolean
  onSummaryDateRangeChange: (value: SummaryDateRange) => void
  onSummaryMessageTypesChange: (value: SummaryMessageType[]) => void
  onOpenModelSettings: () => void
  onGenerate: () => void
  onCloseResult: () => void
  onCopyImage: () => Promise<{ success: boolean; error?: string }>
  onRevealReport: () => Promise<{ success: boolean; error?: string }>
}

const rangeLabel = (range: SummaryDateRange): string => {
  if (range === 'yesterday') return '昨日'
  if (range === '7days') return '近 7 天'
  return '今天'
}

const modelLabel = (model: string): string => {
  if (model === 'deepseek-chat') return 'DeepSeek Chat'
  if (model === 'gpt-4o-mini') return 'GPT-4o Mini'
  if (model === 'gpt-4o') return 'GPT-4o'
  if (model === 'gpt-4-turbo') return 'GPT-4 Turbo'
  if (model === 'claude-3-5-sonnet-20240620') return 'Claude 3.5 Sonnet'
  if (model === 'moonshot-v1-8k') return 'Moonshot V1'
  return model || '未选择模型'
}

export function AiReportWorkspace({
  sourceContact,
  summaryDateRange,
  summaryMessageTypes,
  modelConfig,
  rangeMessageCount,
  reportMessageCount,
  messageTypeCounts,
  rangeState,
  phase,
  error,
  generatedImage,
  reportPaths,
  isGenerating,
  onSummaryDateRangeChange,
  onSummaryMessageTypesChange,
  onOpenModelSettings,
  onGenerate,
  onCloseResult,
  onCopyImage,
  onRevealReport
}: AiReportWorkspaceProps): React.ReactElement {
  const [actionStatus, setActionStatus] = useState('')
  const groupName = sourceContact?.m_nsNickName || sourceContact?.m_nsUsrName || '未选择群聊'
  const configDisabled = isGenerating
  const disabledReason = useMemo(() => {
    if (!sourceContact) return '请先选择群聊'
    if (!modelConfig.apiKey.trim()) return '请先配置 API Key'
    if (rangeState.status === 'loading') return '正在计算消息数量'
    if (rangeState.status === 'error') return rangeState.error
    if (!reportMessageCount) return '当前范围没有可总结消息'
    if (!summaryMessageTypes.length) return '请至少选择一种消息类型'
    return ''
  }, [modelConfig.apiKey, rangeState, reportMessageCount, sourceContact, summaryMessageTypes.length])
  const canGenerate = !isGenerating && !disabledReason
  const modelStatus =
    modelConfig.apiKey.trim() && modelConfig.baseURL.trim()
      ? '配置正常'
      : modelConfig.apiKey.trim() || modelConfig.baseURL.trim()
        ? '配置不完整'
        : '尚未配置'

  const handleCopy = async (): Promise<void> => {
    const result = await onCopyImage()
    setActionStatus(result.success ? '图片已复制' : result.error || '复制失败')
  }

  const handleReveal = async (): Promise<void> => {
    const result = await onRevealReport()
    setActionStatus(result.success ? '已在文件夹中显示' : result.error || '打开文件夹失败')
  }

  return (
    <main className="ai-report-workspace">
      <header className="ai-report-header">
        <div>
          <h1>生成群聊日报</h1>
          <p>
            {groupName} · {rangeLabel(summaryDateRange)}
          </p>
        </div>
        {phase === 'error' && error && <div className="report-inline-error">{error}</div>}
      </header>

      <div className="ai-report-body">
        {!sourceContact && (
          <div className="report-empty-state">
            <h2>未选择群聊</h2>
            <p>从左侧选择一个群聊后，可以配置范围并生成 AI 群聊日报。</p>
          </div>
        )}

        <ReportRangeSelector
          value={summaryDateRange}
          messageCount={rangeMessageCount}
          rangeState={rangeState}
          disabled={configDisabled}
          onChange={onSummaryDateRangeChange}
        />
        <MessageTypeSelector
          value={summaryMessageTypes}
          counts={messageTypeCounts}
          disabled={configDisabled}
          onChange={onSummaryMessageTypesChange}
        />
        <ReportSectionSelector />
        <ReportDensitySelector />
        <ModelSummary
          config={modelConfig}
          onOpenSettings={onOpenModelSettings}
        />
        <section className="report-privacy-note">
          <h3>隐私说明</h3>
          <p>微信数据库和聊天记录默认从本机读取。</p>
          <p>所选内容将发送至你配置的模型服务进行处理。</p>
          <p>WechatExplorer 本身不额外保存或转发内容。</p>
        </section>

        {generatedImage && (
          <section className="report-result-panel">
            <div className="report-section-heading">
              <h3>生成成功</h3>
              <span>{reportPaths ? 'HTML 与 PNG 已导出' : '结果已生成'}</span>
            </div>
            <div className="report-result-preview">
              <img src={generatedImage} alt="生成的群聊日报" />
            </div>
            <div className="report-result-actions">
              <button type="button" onClick={handleCopy}>
                复制图片
              </button>
              <button type="button" onClick={handleReveal} disabled={!reportPaths}>
                在文件夹中显示
              </button>
              <button type="button" onClick={onCloseResult}>
                关闭预览
              </button>
            </div>
            {actionStatus && <p className="report-action-status">{actionStatus}</p>}
          </section>
        )}
      </div>

      <footer className="ai-report-footer">
        <span className="report-footer-note">
          {modelLabel(modelConfig.model)} · {modelStatus} · 所选内容会发送至你配置的模型服务
        </span>
        <div className="report-footer-actions">
          {disabledReason && !isGenerating && <span>{disabledReason}</span>}
          <button type="button" disabled={!canGenerate} onClick={onGenerate}>
            {isGenerating ? '正在生成日报' : '开始生成日报'}
          </button>
        </div>
      </footer>
    </main>
  )
}
