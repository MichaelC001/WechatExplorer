import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Contact, Message } from '../../../shared/types'
import {
  buildGroupReportInput,
  getSummaryDateRange,
  GROUP_REPORT_SYSTEM_PROMPT,
  isInternalName,
  parseGroupDailyReport,
  SUMMARY_TYPE_OPTIONS,
  SummaryDateRange,
  SummaryMessageType
} from '../utils/group-report'

const REPORT_STEP_TIMEOUT_MS = 90_000

export type ReportGenerationPhase =
  | 'idle'
  | 'loadingMessages'
  | 'preparingInput'
  | 'requestingModel'
  | 'exportingReport'
  | 'success'
  | 'error'

export interface AiModelConfig {
  providerId?: string
  providerName: string
  model: string
  modelName: string
  configured: boolean
  status: 'untested' | 'connected' | 'error'
}

export interface ReportPaths {
  htmlPath: string
  pngPath: string
}

export interface ReportGenerationResult {
  imageDataUrl: string
  paths: ReportPaths
}

export interface ReportGenerationLog {
  label: string
  startedAt: string
  endedAt: string
  duration: number
}

export interface ReportGenerationMetadata {
  durationMs?: number
  modelName?: string
  tokenUsage?: {
    input?: number
    output?: number
    total?: number
    estimated?: boolean
  }
  generationLogs: ReportGenerationLog[]
}

interface UseGroupReportGenerationArgs {
  sourceContact: Contact | null
  summaryDateRange: SummaryDateRange
  summaryMessageTypes: SummaryMessageType[]
  modelConfig: AiModelConfig
}

export interface ReportTaskStep {
  id: Exclude<ReportGenerationPhase, 'idle' | 'success' | 'error'>
  label: string
}

export const REPORT_TASK_STEPS: ReportTaskStep[] = [
  { id: 'loadingMessages', label: '读取并筛选聊天记录' },
  { id: 'preparingInput', label: '整理日报输入' },
  { id: 'requestingModel', label: '调用模型生成内容' },
  { id: 'exportingReport', label: '导出 HTML 与 PNG' }
]

export interface RangeMessageState {
  status: 'idle' | 'loading' | 'success' | 'error'
  error: string
}

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} 超时`)), REPORT_STEP_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isGroupContact = (contact: Contact | null): boolean =>
  Boolean(contact?.type === 'group' || contact?.m_nsUsrName?.endsWith('@chatroom'))

const selectedMessageTypeSet = (types: SummaryMessageType[]): Set<string> =>
  new Set(
    SUMMARY_TYPE_OPTIONS.filter((option) => types.includes(option.value)).flatMap(
      (option) => option.messageTypes
    )
  )

const estimateTokenCount = (length: number): number => Math.max(1, Math.ceil(length / 1.6))

const estimateTokenUsage = (
  inputMessages: { role: string; content: string }[],
  output: string
): NonNullable<ReportGenerationMetadata['tokenUsage']> => {
  const inputLength = inputMessages.reduce((total, message) => total + message.content.length, 0)
  const outputLength = output.replace(/\s+/g, '').length
  const input = estimateTokenCount(inputLength)
  const outputCount = estimateTokenCount(outputLength)
  return {
    input,
    output: outputCount,
    total: input + outputCount,
    estimated: true
  }
}

const applyGroupMemberNames = async (contact: Contact, messages: Message[]): Promise<Message[]> => {
  let memberMap = new Map<string, { nickname: string; avatar: string }>()
  try {
    const snapshot = await withTimeout(window.api.getGroupSnapshot(contact.md5), '读取群成员')
    memberMap = new Map(
      (snapshot?.members || []).map((member) => [
        member.wxid,
        { nickname: member.nickname || member.wxid, avatar: member.avatar || '' }
      ])
    )
  } catch (error) {
    console.warn('[GroupReport] member snapshot failed:', error)
  }

  if (!memberMap.size) return messages
  return messages.map((message) => {
    if (!isInternalName(message.name)) return message
    const senderId = String(message.senderId || message.name || '')
    const member = memberMap.get(senderId)
    if (!member?.nickname || isInternalName(member.nickname)) return message
    return { ...message, name: member.nickname, img: message.img || member.avatar }
  })
}

export function useGroupReportGeneration({
  sourceContact,
  summaryDateRange,
  summaryMessageTypes,
  modelConfig
}: UseGroupReportGenerationArgs): {
  phase: ReportGenerationPhase
  error: string
  rangeMessages: Message[]
  reportMessages: Message[]
  messageTypeCounts: Record<SummaryMessageType, number>
  rangeState: RangeMessageState
  generatedImage: string | null
  reportPaths: ReportPaths | null
  generationMetadata: ReportGenerationMetadata
  isGenerating: boolean
  generate: () => Promise<void>
  retry: () => Promise<void>
  resetGenerationStatus: () => void
  clearError: () => void
  closeResult: () => void
  copyImage: () => Promise<{ success: boolean; error?: string }>
  revealReport: () => Promise<{ success: boolean; error?: string }>
} {
  const [phase, setPhase] = useState<ReportGenerationPhase>('idle')
  const [error, setError] = useState('')
  const [rangeMessages, setRangeMessages] = useState<Message[]>([])
  const [rangeState, setRangeState] = useState<RangeMessageState>({ status: 'idle', error: '' })
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [reportPaths, setReportPaths] = useState<ReportPaths | null>(null)
  const [generationMetadata, setGenerationMetadata] = useState<ReportGenerationMetadata>({
    generationLogs: []
  })
  const rangeRequestIdRef = useRef(0)

  const isGenerating =
    phase === 'loadingMessages' ||
    phase === 'preparingInput' ||
    phase === 'requestingModel' ||
    phase === 'exportingReport'

  const loadRangeMessages = useCallback(
    async (markAsTaskPhase: boolean): Promise<Message[]> => {
      if (!sourceContact) return []
      const requestId = ++rangeRequestIdRef.current
      const { startTime, endTime } = getSummaryDateRange(summaryDateRange)
      setRangeState({ status: 'loading', error: '' })
      if (markAsTaskPhase) setPhase('loadingMessages')
      try {
        const messages = await withTimeout(
          window.api.getMessages(sourceContact.md5, startTime, endTime),
          '读取聊天记录'
        )
        if (requestId === rangeRequestIdRef.current) {
          setRangeMessages(messages)
          setRangeState({ status: 'success', error: '' })
        }
        return messages
      } catch (loadError) {
        const message = errorMessage(loadError)
        if (requestId === rangeRequestIdRef.current) {
          setRangeMessages([])
          setRangeState({ status: 'error', error: message })
        }
        throw loadError
      }
    },
    [sourceContact, summaryDateRange]
  )

  useEffect(() => {
    if (!sourceContact || !isGroupContact(sourceContact)) {
      rangeRequestIdRef.current += 1
      setRangeMessages([])
      setRangeState({ status: 'idle', error: '' })
      return
    }

    let active = true
    void loadRangeMessages(false).catch((loadError) => {
      if (!active) return
      console.warn('[GroupReport] range messages load failed:', loadError)
    })
    return () => {
      active = false
    }
  }, [sourceContact, summaryDateRange, loadRangeMessages])

  const allowedTypes = useMemo(
    () => selectedMessageTypeSet(summaryMessageTypes),
    [summaryMessageTypes]
  )

  const messageTypeCounts = useMemo(() => {
    const counts = Object.fromEntries(
      SUMMARY_TYPE_OPTIONS.map((option) => [option.value, 0])
    ) as Record<SummaryMessageType, number>
    for (const message of rangeMessages) {
      const option = SUMMARY_TYPE_OPTIONS.find((item) => item.messageTypes.includes(message.type))
      if (option) counts[option.value] += 1
    }
    return counts
  }, [rangeMessages])

  const reportMessages = useMemo(
    () => rangeMessages.filter((message) => allowedTypes.has(message.type)),
    [allowedTypes, rangeMessages]
  )

  const resetGenerationStatus = useCallback((): void => {
    setPhase('idle')
    setError('')
    setGeneratedImage(null)
    setReportPaths(null)
    setGenerationMetadata({ generationLogs: [] })
  }, [])

  const generate = useCallback(async (): Promise<void> => {
    if (isGenerating) return
    if (!sourceContact) {
      setPhase('error')
      setError('请先选择一个群聊')
      return
    }
    if (!isGroupContact(sourceContact)) {
      setPhase('error')
      setError('AI 群聊日报仅支持群聊')
      return
    }
    if (!modelConfig.configured) {
      setPhase('error')
      setError('尚未配置可用的默认 AI 模型')
      return
    }
    if (!summaryMessageTypes.length) {
      setPhase('error')
      setError('请至少选择一种消息类型')
      return
    }

    const startGenerateTime = Date.now()
    const logs: ReportGenerationLog[] = []
    const pushLog = (log: ReportGenerationLog): void => {
      logs.push(log)
      setGenerationMetadata({
        modelName: modelConfig.model,
        generationLogs: [...logs]
      })
    }
    const createStepLog = (label: string, startedAt: Date, endedAt: Date): ReportGenerationLog => ({
      label,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      duration: endedAt.getTime() - startedAt.getTime()
    })
    const trackStep = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
      const startedAt = new Date()
      try {
        return await task()
      } finally {
        pushLog(createStepLog(label, startedAt, new Date()))
      }
    }

    setError('')
    setGeneratedImage(null)
    setReportPaths(null)
    setGenerationMetadata({
      modelName: modelConfig.model,
      generationLogs: []
    })

    try {
      const sourceMessages = await trackStep('读取聊天记录', () => loadRangeMessages(true))

      const selectedTypes = selectedMessageTypeSet(summaryMessageTypes)
      const filteredMessages = sourceMessages.filter((message) => selectedTypes.has(message.type))
      if (!filteredMessages.length) throw new Error('当前范围没有可总结消息')

      setPhase('preparingInput')
      const input = await trackStep('整理输入', async () => {
        const namedReportMessages = await applyGroupMemberNames(sourceContact, filteredMessages)
        return buildGroupReportInput(namedReportMessages, sourceContact, true)
      })

      setPhase('requestingModel')
      const aiMessages = [
        { role: 'system', content: GROUP_REPORT_SYSTEM_PROMPT },
        { role: 'user', content: input.prompt }
      ]
      const result = await trackStep('AI 生成', () =>
        withTimeout(
          window.api.aiChat(aiMessages, {
            providerId: modelConfig.providerId,
            modelId: modelConfig.model
          }),
          'AI 生成日报'
        )
      )
      if (!result.success || !result.data) throw new Error(result.error || 'AI 请求失败')

      const tokenUsage =
        result.usage && result.usage.total
          ? result.usage
          : estimateTokenUsage(aiMessages, result.data)

      const report = parseGroupDailyReport(result.data, input.topSpeakers, input.activeTimeline)

      setPhase('exportingReport')
      const exported = await withTimeout(
        window.api.exportGroupReport({ report, metadata: input.metadata }),
        '日报图片导出'
      )
      if (!exported.success || !exported.imageDataUrl || !exported.htmlPath || !exported.pngPath) {
        throw new Error(exported.error || '日报文件生成失败')
      }
      if (exported.exportTimings?.html) {
        pushLog({
          label: 'HTML 导出',
          ...exported.exportTimings.html
        })
      }
      if (exported.exportTimings?.png) {
        pushLog({
          label: 'PNG 导出',
          ...exported.exportTimings.png
        })
      }
      const exportFinishedAt =
        exported.exportTimings?.png?.endedAt || exported.exportTimings?.html?.endedAt
      const exportFinishTime = exportFinishedAt ? Date.parse(exportFinishedAt) : Date.now()

      setGeneratedImage(exported.imageDataUrl)
      setReportPaths({ htmlPath: exported.htmlPath, pngPath: exported.pngPath })
      setGenerationMetadata({
        durationMs:
          Number.isFinite(exportFinishTime) && exportFinishTime > startGenerateTime
            ? exportFinishTime - startGenerateTime
            : Date.now() - startGenerateTime,
        modelName: modelConfig.model,
        tokenUsage,
        generationLogs: [...logs]
      })
      setPhase('success')
    } catch (generateError) {
      setError(errorMessage(generateError))
      setPhase('error')
    }
  }, [isGenerating, loadRangeMessages, modelConfig, sourceContact, summaryMessageTypes])

  const clearError = useCallback((): void => {
    setError('')
    setPhase('idle')
  }, [])

  const closeResult = useCallback((): void => {
    setGeneratedImage(null)
  }, [])

  const copyImage = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!generatedImage) return { success: false, error: '没有可复制的日报图片' }
    return window.api.copyImage(generatedImage)
  }, [generatedImage])

  const revealReport = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!reportPaths) return { success: false, error: '没有可显示的日报文件' }
    return window.api.revealGroupReport(reportPaths.pngPath)
  }, [reportPaths])

  return {
    phase,
    error,
    rangeMessages,
    reportMessages,
    messageTypeCounts,
    rangeState,
    generatedImage,
    reportPaths,
    generationMetadata,
    isGenerating,
    generate,
    retry: generate,
    resetGenerationStatus,
    clearError,
    closeResult,
    copyImage,
    revealReport
  }
}
