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
