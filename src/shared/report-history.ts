export type ReportAssetStatus = 'ready' | 'missing'

export interface GeneratedReportRecord {
  id: string
  contactId: string
  contactName: string
  contactAvatar?: string
  dateRange: string
  messageCount: number
  generatedAt: string
  reportDate: string
  htmlPath?: string
  pngPath?: string
  jsonPath?: string
  htmlStatus: ReportAssetStatus
  pngStatus: ReportAssetStatus
  generatedImage?: string
  imageSize?: {
    width: number
    height: number
  }
  duration?: number
  modelName?: string
  tokenUsage?: {
    input?: number
    output?: number
    total?: number
    estimated?: boolean
  }
  fileSize?: {
    html?: number
    png?: number
  }
  generationLogs?: {
    label: string
    startedAt: string
    endedAt: string
    duration: number
  }[]
}

export interface SaveGeneratedReportRequest {
  contactId: string
  contactName: string
  contactAvatar?: string
  dateRange: string
  messageCount: number
  generatedAt: string
  generatedImage?: string
  htmlPath?: string
  pngPath?: string
  duration?: number
  modelName?: string
  tokenUsage?: {
    input?: number
    output?: number
    total?: number
    estimated?: boolean
  }
  generationLogs?: {
    label: string
    startedAt: string
    endedAt: string
    duration: number
  }[]
}

export interface ReportHistoryResult {
  success: boolean
  reports?: GeneratedReportRecord[]
  error?: string
}

export interface SaveGeneratedReportResult {
  success: boolean
  record?: GeneratedReportRecord
  error?: string
}

export interface DeleteGeneratedReportResult {
  success: boolean
  deletedId?: string
  error?: string
}
