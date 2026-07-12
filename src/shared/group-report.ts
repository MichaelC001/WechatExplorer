export type ReportHeat = '高' | '中' | '低'

export interface ReportTopic {
  title: string
  timeRange: string
  heat: ReportHeat
  participants: string[]
  summary: string
  conclusion?: string
  keywords: string[]
}

export interface ReportResource {
  title: string
  description: string
  sender?: string
}

export interface ReportImportantMessage {
  sender: string
  time: string
  content: string
  note: string
}

export interface ReportQuoteMessage {
  sender: string
  content: string
}

export interface ReportQuote {
  messages: ReportQuoteMessage[]
  note: string
}

export interface ReportQuestionAnswer {
  question: string
  answer: string
  answerer?: string
}

export interface ReportTopicHeat {
  topic: string
  score: number
}

export interface ReportSpeakerRank {
  name: string
  count: number
}

export interface GroupDailyReport {
  overview: string
  topics: ReportTopic[]
  resources: ReportResource[]
  importantMessages: ReportImportantMessage[]
  quotes: ReportQuote[]
  qa: ReportQuestionAnswer[]
  analytics: {
    topicHeat: ReportTopicHeat[]
    activeTimeline: string
    topSpeakers: ReportSpeakerRank[]
  }
  keywords: string[]
}

export interface GroupReportMetadata {
  groupName: string
  reportDate: string
  dateRange: string
  messageCount: number
  activeUsers: number
  timeSpan: string
  generatedAt: string
  recordNote: string
  footerNote: string
  heroParticipants: string[]
  avatars: Record<string, string | undefined>
  // === 新增(可选,向后兼容) ===
  /** 群昵称 / wxid / md5,服务端用来反推真头像(从 getGroupSnapshot) */
  talker?: string
  /** 预留,与 /api/v1/chatlog 的 time 参数同格式 */
  timeRange?: string
  /** 服务端写回,告知 client enrich 失败/部分缺失 */
  warnings?: string[]
}

export interface GroupReportExportRequest {
  report: GroupDailyReport
  metadata: GroupReportMetadata
}

export interface GroupReportExportResult {
  success: boolean
  htmlPath?: string
  pngPath?: string
  imageDataUrl?: string
  exportTimings?: {
    html?: {
      startedAt: string
      endedAt: string
      duration: number
    }
    png?: {
      startedAt: string
      endedAt: string
      duration: number
    }
  }
  warnings?: string[]
  error?: string
}
