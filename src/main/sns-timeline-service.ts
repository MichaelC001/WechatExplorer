import type { Message, ParsedContent } from '../shared/types'
import { parseSnsTimelineXml, snsRowToContent, snsTextOf } from '../shared/sns-timeline'
import type { Wcdb4Client } from './wcdb4-client'

/** 朋友圈只读服务：sns.db → 可读卡片 / 导出消息。 */
export class SnsTimelineService {
  constructor(private readonly wcdb4Client: Wcdb4Client) {}

  async listContents(limit = 200): Promise<ParsedContent[]> {
    const rows = await this.wcdb4Client.listSnsTimeline(limit)
    return rows.map((row) => snsRowToContent({ ...row, content: String(row.content ?? '') }) as ParsedContent)
  }

  async listExportMessages(limit = 200): Promise<Message[]> {
    const rows = await this.wcdb4Client.listSnsTimeline(limit)
    return rows.map((row, index) => {
      const content = String(row.content ?? '')
      const contentData = snsRowToContent({ ...row, content }) as ParsedContent
      const post = parseSnsTimelineXml(content)
      const createTime = post.createTime || 0
      return {
        id: `sns-${row.tid ?? index}`,
        from: 'sns',
        type: '朋友圈',
        datetime: createTime ? new Date(createTime * 1000).toISOString() : '',
        content: snsTextOf(row),
        isSender: false,
        createTime,
        name: '朋友圈',
        contentData
      } as Message
    })
  }

  async searchHits(query: string, limit = 20): Promise<Array<{ text: string; timestamp?: number }>> {
    const needle = String(query || '').trim().toLowerCase()
    if (!needle) return []
    const rows = await this.wcdb4Client.listSnsTimeline(500)
    return rows
      .map((row) => {
        const content = String(row.content ?? '')
        const post = parseSnsTimelineXml(content)
        return { text: snsTextOf({ ...row, content }), timestamp: post.createTime }
      })
      .filter((hit) => hit.text.toLowerCase().includes(needle))
      .slice(0, limit)
  }
}
