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
  apiKey: string
  baseURL: string
  model: string
}

export interface ReportPaths {
  htmlPath: string
  pngPath: string
}

export interface ReportGenerationResult {
  imageDataUrl: string
  paths: ReportPaths
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

const withTimeout = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
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

const applyGroupMemberNames = async (
  contact: Contact,
  messages: Message[]
): Promise<Message[]> => {
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
  isGenerating: boolean
  generate: () => Promise<void>
  retry: () => Promise<void>
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
    if (!modelConfig.apiKey.trim()) {
      setPhase('error')
      setError('尚未配置 API Key')
      return
    }
    if (!summaryMessageTypes.length) {
      setPhase('error')
      setError('请至少选择一种消息类型')
      return
    }

    setError('')
    setGeneratedImage(null)
    setReportPaths(null)

    try {
      const sourceMessages =
        rangeState.status === 'success' ? rangeMessages : await loadRangeMessages(true)
      if (rangeState.status === 'success') setPhase('loadingMessages')

      const selectedTypes = selectedMessageTypeSet(summaryMessageTypes)
      const filteredMessages = sourceMessages.filter((message) => selectedTypes.has(message.type))
      if (!filteredMessages.length) throw new Error('当前范围没有可总结消息')

      setPhase('preparingInput')
      const namedReportMessages = await applyGroupMemberNames(sourceContact, filteredMessages)
      const input = buildGroupReportInput(namedReportMessages, sourceContact, true)

      setPhase('requestingModel')
      const result = await withTimeout(
        window.api.aiChat(
          [
            { role: 'system', content: GROUP_REPORT_SYSTEM_PROMPT },
            { role: 'user', content: input.prompt }
          ],
          modelConfig
        ),
        'AI 生成日报'
      )
      if (!result.success || !result.data) throw new Error(result.error || 'AI 请求失败')

      const report = parseGroupDailyReport(result.data, input.topSpeakers, input.activeTimeline)

      setPhase('exportingReport')
      const exported = await withTimeout(
        window.api.exportGroupReport({ report, metadata: input.metadata }),
        '日报图片导出'
      )
      if (!exported.success || !exported.imageDataUrl || !exported.htmlPath || !exported.pngPath) {
        throw new Error(exported.error || '日报文件生成失败')
      }

      setGeneratedImage(exported.imageDataUrl)
      setReportPaths({ htmlPath: exported.htmlPath, pngPath: exported.pngPath })
      setPhase('success')
    } catch (generateError) {
      setError(errorMessage(generateError))
      setPhase('error')
    }
  }, [
    isGenerating,
    loadRangeMessages,
    modelConfig,
    rangeMessages,
    rangeState.status,
    sourceContact,
    summaryMessageTypes
  ])

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
    isGenerating,
    generate,
    retry: generate,
    clearError,
    closeResult,
    copyImage,
    revealReport
  }
}
