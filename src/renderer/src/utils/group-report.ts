import { Contact, Message } from '../../../shared/types'
import {
  GroupDailyReport,
  GroupReportMetadata,
  ReportHeat,
  ReportImportantMessage,
  ReportQuestionAnswer,
  ReportQuote,
  ReportResource,
  ReportSpeakerRank,
  ReportTopic
} from '../../../shared/group-report'

export const GROUP_REPORT_SYSTEM_PROMPT = `你是微信群聊日报编辑。请仅根据用户提供的聊天记录生成结构化中文日报。

原则：
1. 不得编造聊天中没有的事实、结论、参与者或链接内容。
2. 仅使用输入中的昵称，不输出 wxid、微信 ID、会话 ID 等内部标识。
3. 图片、表情、语音、视频或链接内容不可见时，仅标注消息类型，不要猜测。
4. 摘要说明发生了什么、大家如何回应、最后形成什么结论或氛围。
5. 语气准确、轻巧、有信息密度，避免侮辱性和歧视性评价。
6. 没有实际内容的可选栏目输出空数组，不要凑数。
7. 只输出一个可被 JSON.parse 解析的 JSON 对象，不要输出 Markdown 代码块或其他文字。

JSON 结构必须为：
{
  "overview": "1至2句整体讨论风格与氛围",
  "topics": [{
    "title": "话题标题",
    "timeRange": "HH:mm-HH:mm",
    "heat": "高|中|低",
    "participants": ["昵称"],
    "summary": "话题摘要",
    "conclusion": "结论或氛围",
    "keywords": ["关键词"]
  }],
  "resources": [{"title":"资源名","description":"用途或内容","sender":"昵称"}],
  "importantMessages": [{"sender":"昵称","time":"HH:mm","content":"消息摘要","note":"为什么重要"}],
  "quotes": [{"messages":[{"sender":"昵称","content":"简短原话"}],"note":"点评"}],
  "qa": [{"question":"问题","answer":"答案与结论","answerer":"昵称"}],
  "keywords": ["关键词"]
}

topics 提取 3 至 7 个，参与者最多 5 人，quotes 最多 3 组，keywords 输出 8 至 15 个。`

const isInternalIdentifier = (value: string): boolean =>
  /@chatroom$/i.test(value) || /^wxid_/i.test(value) || /^[a-z0-9_-]{18,}$/i.test(value)

const summarySender = (message: Message, contact: Contact | null, isGroup: boolean): string => {
  if (message.from === 'assistant') {
    const ownGroupNickname = message.name?.trim()
    if (isGroup && ownGroupNickname && !isInternalIdentifier(ownGroupNickname)) {
      return ownGroupNickname
    }
    return '我'
  }
  const candidate = isGroup ? message.name : contact?.m_nsNickName
  if (!candidate || isInternalIdentifier(candidate)) return isGroup ? '未命名群成员' : '对方'
  return candidate
}

const summaryContent = (message: Message): string => {
  const data = message.contentData
  if (!data) return message.content?.trim() || `[${message.type || '消息'}]`

  switch (data.type) {
    case 'image':
      return '[图片]'
    case 'sticker':
      return '[表情]'
    case 'voice':
      return `[语音${data.duration ? ` ${data.duration}秒` : ''}]`
    case 'share':
      return `[分享] ${data.title}${data.des ? `：${data.des}` : ''}`
    case 'quote': {
      const reply = data.title || data.content || message.content || '[回复]'
      const quotedSender =
        data.quotedSender && !isInternalIdentifier(data.quotedSender) ? data.quotedSender : '群成员'
      return `${reply}（引用 ${quotedSender}：${data.quotedContent || `[引用${data.quotedType || '消息'}]`}）`
    }
    case 'location':
      return `[位置] ${data.poiname || data.label || '位置消息'}`
    case 'card':
      return `[名片] ${data.nickname || '微信名片'}`
    case 'voip':
      return `[通话] ${data.status}${data.duration ? `，${data.duration}秒` : ''}`
    case 'system':
    case 'text':
      return data.content
    case 'unknown':
      return `[${message.type || '未知消息'}]`
  }

  return `[${message.type || '消息'}]`
}

const localDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const localTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  })

export interface GroupReportInput {
  prompt: string
  metadata: GroupReportMetadata
  topSpeakers: ReportSpeakerRank[]
  activeTimeline: string
}

export const buildGroupReportInput = (
  messages: Message[],
  contact: Contact | null,
  isGroup: boolean
): GroupReportInput => {
  const rows = messages.map((message) => ({
    datetime: message.datetime,
    timestamp: new Date(message.datetime).getTime(),
    sender: summarySender(message, contact, isGroup),
    content: summaryContent(message),
    avatar: message.img
  }))

  let firstTimestamp = Number.POSITIVE_INFINITY
  let lastTimestamp = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    if (!Number.isFinite(row.timestamp)) continue
    firstTimestamp = Math.min(firstTimestamp, row.timestamp)
    lastTimestamp = Math.max(lastTimestamp, row.timestamp)
  }
  if (!Number.isFinite(firstTimestamp)) firstTimestamp = Date.now()
  if (!Number.isFinite(lastTimestamp)) lastTimestamp = firstTimestamp
  const speakerCounts = new Map<string, number>()
  const hourCounts = new Map<number, number>()
  const avatars: Record<string, string | undefined> = {}
  for (const row of rows) {
    speakerCounts.set(row.sender, (speakerCounts.get(row.sender) || 0) + 1)
    if (Number.isFinite(row.timestamp)) {
      const hour = new Date(row.timestamp).getHours()
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
    }
    if (row.avatar && !avatars[row.sender]) avatars[row.sender] = row.avatar
  }

  const topSpeakers = Array.from(speakerCounts, ([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
  const activeTimeline = Array.from(hourCounts, ([hour, count]) => ({ hour, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4)
    .sort((left, right) => left.hour - right.hour)
    .map(
      ({ hour, count }) =>
        `${String(hour).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:59（${count}条）`
    )
    .join('、')

  const startDate = localDate(firstTimestamp)
  const endDate = localDate(lastTimestamp)
  const sameDay = startDate === endDate
  const dateRange = sameDay
    ? `${startDate} ${localTime(firstTimestamp)}-${localTime(lastTimestamp)}`
    : `${startDate} ${localTime(firstTimestamp)} 至 ${endDate} ${localTime(lastTimestamp)}`
  // 模板"持续时长"格子:首条到末条消息的时长,紧凑半角格式
  const durationMs = Math.max(0, lastTimestamp - firstTimestamp)
  const durationHours = durationMs / 3600000
  const timeSpan = (() => {
    if (sameDay) {
      if (durationHours < 1) {
        const minutes = Math.max(1, Math.round(durationMs / 60000))
        return `${minutes} min`
      }
      const hours = Math.max(1, Math.ceil(durationHours))
      return `${hours} h`
    }
    const days = Math.max(1, Math.ceil(durationMs / 86400000))
    return `${days} d`
  })()
  const contactName = contact?.m_nsNickName || ''
  const groupName = contactName && !isInternalIdentifier(contactName) ? contactName : '未命名会话'
  const metadata: GroupReportMetadata = {
    groupName,
    reportDate: sameDay ? startDate : `${startDate}_to_${endDate}`,
    dateRange,
    messageCount: rows.length,
    activeUsers: speakerCounts.size,
    timeSpan,
    generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    recordNote: `基于当前已加载的 ${rows.length} 条记录`,
    footerNote: '基于已读取聊天记录生成；图片、表情等未解析内容仅按类型统计。',
    heroParticipants: topSpeakers.slice(0, 4).map((speaker) => speaker.name),
    avatars
  }
  const transcript = rows.map((row) => `${row.datetime} ${row.sender}：${row.content}`).join('\n')
  const prompt = `请为以下微信${isGroup ? '群聊' : '对话'}记录生成日报 JSON。

会话名：${groupName}
时间范围：${dateRange}
消息数：${rows.length}
活跃人数：${speakerCounts.size}
完整性：仅基于当前应用已加载的记录。

聊天记录：
${transcript}`
  return { prompt, metadata, topSpeakers, activeTimeline }
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const asName = (value: unknown): string => {
  const name = asString(value)
  return name && !isInternalIdentifier(name) ? name : '未命名群成员'
}
const asNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const asStrings = (value: unknown, limit = 20): string[] =>
  asArray(value).map(asString).filter(Boolean).slice(0, limit)

const normalizeHeat = (value: unknown): ReportHeat => {
  const heat = asString(value)
  if (heat.includes('高')) return '高'
  if (heat.includes('低')) return '低'
  return '中'
}

const extractJson = (raw: string): unknown => {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 未返回可解析的日报 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export const parseGroupDailyReport = (
  raw: string,
  topSpeakers: ReportSpeakerRank[],
  activeTimeline: string
): GroupDailyReport => {
  const root = asObject(extractJson(raw))
  const topics: ReportTopic[] = asArray(root.topics)
    .map((value) => {
      const item = asObject(value)
      return {
        title: asString(item.title),
        timeRange: asString(item.timeRange),
        heat: normalizeHeat(item.heat),
        participants: asArray(item.participants).map(asName).filter(Boolean).slice(0, 5),
        summary: asString(item.summary),
        conclusion: asString(item.conclusion),
        keywords: asStrings(item.keywords, 8)
      }
    })
    .filter((topic) => topic.title && topic.summary)
    .slice(0, 7)
  if (!topics.length) throw new Error('AI 日报中没有有效话题')

  const resources: ReportResource[] = asArray(root.resources)
    .map((value) => {
      const item = asObject(value)
      return {
        title: asString(item.title),
        description: asString(item.description),
        sender: item.sender ? asName(item.sender) : undefined
      }
    })
    .filter((item) => item.title && item.description)
  const importantMessages: ReportImportantMessage[] = asArray(root.importantMessages)
    .map((value) => {
      const item = asObject(value)
      return {
        sender: asName(item.sender),
        time: asString(item.time),
        content: asString(item.content),
        note: asString(item.note)
      }
    })
    .filter((item) => item.sender && item.content)
  const quotes: ReportQuote[] = asArray(root.quotes)
    .map((value) => {
      const item = asObject(value)
      return {
        messages: asArray(item.messages)
          .map((messageValue) => {
            const message = asObject(messageValue)
            return { sender: asName(message.sender), content: asString(message.content) }
          })
          .filter((message) => message.sender && message.content),
        note: asString(item.note)
      }
    })
    .filter((quote) => quote.messages.length)
    .slice(0, 3)
  const qa: ReportQuestionAnswer[] = asArray(root.qa)
    .map((value) => {
      const item = asObject(value)
      return {
        question: asString(item.question),
        answer: asString(item.answer),
        answerer: item.answerer ? asName(item.answerer) : undefined
      }
    })
    .filter((item) => item.question && item.answer)

  return {
    overview: asString(root.overview) || '基于已读取记录生成的群聊日报。',
    topics,
    resources,
    importantMessages,
    quotes,
    qa,
    analytics: {
      topicHeat: topics.map((topic) => ({
        topic: topic.title,
        score: topic.heat === '高' ? 100 : topic.heat === '中' ? 65 : 35
      })),
      activeTimeline: activeTimeline || '暂无可用时间统计',
      topSpeakers: topSpeakers.map((speaker) => ({
        name: speaker.name,
        count: Math.max(0, asNumber(speaker.count))
      }))
    },
    keywords: asStrings(root.keywords, 15)
  }
}
