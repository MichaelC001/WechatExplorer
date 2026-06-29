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
  error?: string
}
