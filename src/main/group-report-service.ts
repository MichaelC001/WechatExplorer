import { app, BrowserWindow } from 'electron'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  GroupReportExportRequest,
  GroupReportExportResult,
  GroupReportMetadata,
  ReportHeat
} from '../shared/group-report'
import { resolveMd5, getGroupSnapshot } from './services/chat-service'

const TEMPLATE_NAME = 'mobile_daily_report.html'

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const sanitizeFileName = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '未命名群聊'

const hashName = (name: string): number => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

const fallbackAvatar = (name: string): string => {
  const hue = hashName(name) % 360
  const initial = escapeHtml(Array.from(name.trim())[0] || '?')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="18" fill="hsl(${hue} 45% 82%)"/><text x="48" y="58" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif" font-size="38" fill="hsl(${hue} 35% 28%)">${initial}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const imageMimeType = (contentType: string | null, source: string): string => {
  if (contentType?.startsWith('image/')) return contentType.split(';')[0]
  const extension = path.extname(source).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/jpeg'
}

const embedAvatar = async (source: string | undefined, name: string): Promise<string> => {
  if (!source) return fallbackAvatar(name)
  if (/^data:image\/[a-z0-9.+/-]+;base64,[a-z0-9+/=]+$/i.test(source)) return source

  try {
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source, {
        headers: {
          'User-Agent': 'Mozilla/5.0 WechatExplorer',
          Referer: 'https://weixin.qq.com/'
        },
        signal: AbortSignal.timeout(8000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const mime = imageMimeType(response.headers.get('content-type'), source)
      return `data:${mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    }

    const localPath = source.startsWith('file://') ? new URL(source) : source
    const buffer = await fs.readFile(localPath)
    return `data:${imageMimeType(null, source)};base64,${buffer.toString('base64')}`
  } catch (error) {
    console.warn(`[GroupReport] avatar fallback for ${name}:`, error)
    return fallbackAvatar(name)
  }
}

const templatePath = (): string => {
  const candidates = [
    path.join(process.resourcesPath, 'resources', TEMPLATE_NAME),
    path.join(app.getAppPath(), 'resources', TEMPLATE_NAME),
    path.join(process.cwd(), 'resources', TEMPLATE_NAME)
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) throw new Error(`日报模板不存在: ${candidates.join(' | ')}`)
  return found
}

/**
 * 从群成员快照反推真头像,填进 metadata.avatars。
 * - 没传 talker → 跳过(向后兼容)
 * - talker 解析失败 / snapshot 拿不到 → 200 + warn,继续走 fallback
 * - 客户端传的 avatars[name](非空)优先;否则从 snapshot 的 m_nsHeadImgUrl 补
 * - 同名取首条(P2 风险:群里两人同名)
 */
const enrichAvatarsFromGroup = async (metadata: GroupReportMetadata): Promise<void> => {
  if (!metadata.talker) return

  const resolved = resolveMd5(metadata.talker)
  if (!resolved) {
    metadata.warnings = metadata.warnings ?? []
    metadata.warnings.push(`enrich skipped: talker "${metadata.talker}" not found`)
    return
  }

  const snapshot = getGroupSnapshot(resolved.md5)
  if (!snapshot) {
    metadata.warnings = metadata.warnings ?? []
    metadata.warnings.push(
      `enrich skipped: group snapshot not available for "${metadata.talker}"`
    )
    return
  }

  const index = new Map<string, string>()
  for (const member of snapshot.members) {
    if (member.nickname && member.avatar && !index.has(member.nickname)) {
      index.set(member.nickname, member.avatar)
    }
  }

  metadata.avatars = metadata.avatars ?? {}
  for (const [name, url] of index) {
    if (metadata.avatars[name]) continue
    metadata.avatars[name] = url
  }

  metadata.warnings = metadata.warnings ?? []
  metadata.warnings.push(
    `enriched ${index.size} member avatars from snapshot (${snapshot.memberCount} members)`
  )
}

const heatClass = (heat: ReportHeat): string => {
  if (heat === '高') return 'hot'
  if (heat === '低') return 'blue'
  return ''
}

const replacePlaceholder = (html: string, key: string, value: string): string =>
  html.replaceAll(`{{${key}}}`, value)

const renderReportHtml = async (request: GroupReportExportRequest): Promise<string> => {
  const { report, metadata } = request
  const avatarNames = new Set<string>(metadata.heroParticipants)
  report.topics.forEach((topic) => topic.participants.forEach((name) => avatarNames.add(name)))
  report.importantMessages.forEach((message) => avatarNames.add(message.sender))
  report.quotes.forEach((quote) =>
    quote.messages.forEach((message) => avatarNames.add(message.sender))
  )
  report.analytics.topSpeakers.forEach((speaker) => avatarNames.add(speaker.name))

  const avatars = new Map<string, string>()
  await Promise.all(
    Array.from(avatarNames).map(async (name) => {
      avatars.set(name, await embedAvatar(metadata.avatars[name], name))
    })
  )
  const avatar = (name: string): string => avatars.get(name) || fallbackAvatar(name)

  const heroNames = metadata.heroParticipants.slice(0, 4)
  while (heroNames.length < 4) heroNames.push(metadata.groupName)
  const heroAvatars = heroNames
    .map((name) => `<img src="${avatar(name)}" alt="${escapeHtml(name)}">`)
    .join('')

  const topicCards = report.topics
    .map(
      (topic) => `<div class="card topic-card">
        <div class="topic-title-row"><h3>${escapeHtml(topic.title)}</h3><span class="heat ${heatClass(topic.heat)}">${escapeHtml(topic.heat)}热</span></div>
        <div class="topic-meta">${escapeHtml(topic.timeRange)}</div>
        <p>${escapeHtml(topic.summary)}</p>
        ${topic.conclusion ? `<p class="muted">${escapeHtml(topic.conclusion)}</p>` : ''}
        <div class="participants">${topic.participants
          .slice(0, 5)
          .map(
            (name) =>
              `<span class="person-chip"><img src="${avatar(name)}" alt=""><b>${escapeHtml(name)}</b></span>`
          )
          .join('')}</div>
        <div class="keywords">${topic.keywords.map((word) => `<span>${escapeHtml(word)}</span>`).join('')}</div>
      </div>`
    )
    .join('')

  const resourceItems = report.resources
    .map(
      (resource) =>
        `<div class="resource"><b>${escapeHtml(resource.title)}</b>${resource.sender ? ` · ${escapeHtml(resource.sender)}` : ''}<br>${escapeHtml(resource.description)}</div>`
    )
    .join('')

  const importantMessages = report.importantMessages
    .map(
      (message) => `<div class="important-card">
        <img class="avatar" src="${avatar(message.sender)}" alt="">
        <div class="important-body"><div class="important-meta"><b>${escapeHtml(message.sender)}</b><span>${escapeHtml(message.time)}</span></div>
        <div class="important-text">${escapeHtml(message.content)}</div><div class="important-note">${escapeHtml(message.note)}</div></div>
      </div>`
    )
    .join('')

  const quoteBlocks = report.quotes
    .map(
      (quote) =>
        `<div class="chat-block">${quote.messages
          .map(
            (
              message
            ) => `<div class="chat-msg"><img class="chat-avatar" src="${avatar(message.sender)}" alt=""><div>
            <div class="chat-name">${escapeHtml(message.sender)}</div><div class="chat-bubble">${escapeHtml(message.content)}</div>
          </div></div>`
          )
          .join('')}<div class="quote-note">${escapeHtml(quote.note)}</div></div>`
    )
    .join('')

  const qaCards = report.qa
    .map(
      (item) =>
        `<div class="qa-card"><b>Q：${escapeHtml(item.question)}</b><div>A：${escapeHtml(item.answer)}${item.answerer ? ` — ${escapeHtml(item.answerer)}` : ''}</div></div>`
    )
    .join('')

  const maxHeat = Math.max(1, ...report.analytics.topicHeat.map((item) => item.score))
  const heatBars = report.analytics.topicHeat
    .map(
      (item) =>
        `<div class="bar-row"><span>${escapeHtml(item.topic)}</span><div class="bar"><i style="width:${Math.max(8, Math.round((item.score / maxHeat) * 100))}%"></i></div></div>`
    )
    .join('')

  const rankItems = report.analytics.topSpeakers
    .slice(0, 5)
    .map(
      (speaker, index) =>
        `<div class="rank"><img src="${avatar(speaker.name)}" alt=""><b>${index + 1}. ${escapeHtml(speaker.name)}</b><span>${Math.max(0, speaker.count)} 条</span></div>`
    )
    .join('')

  const cloudTags = report.keywords
    .slice(0, 15)
    .map(
      (word, index) =>
        `<span class="${index < 2 ? 'xl' : index < 5 ? 'lg' : index < 9 ? 'md' : ''}">${escapeHtml(word)}</span>`
    )
    .join('')

  let html = await fs.readFile(templatePath(), 'utf8')
  const values: Record<string, string> = {
    REPORT_TITLE: escapeHtml(`${metadata.groupName}日报`),
    GROUP_NAME: escapeHtml(metadata.groupName),
    DATE_RANGE: escapeHtml(metadata.dateRange),
    RECORD_NOTE: escapeHtml(`${metadata.recordNote} ${report.overview}`.trim()),
    HERO_AVATARS: heroAvatars,
    MESSAGE_COUNT: String(metadata.messageCount),
    ACTIVE_USERS: String(metadata.activeUsers),
    TIME_SPAN: escapeHtml(metadata.timeSpan || ''),
    TOPIC_COUNT: String(report.topics.length),
    TOPIC_CARDS: topicCards,
    RESOURCES_EMPTY_CLASS: report.resources.length ? '' : 'empty-section',
    RESOURCE_ITEMS: resourceItems,
    MESSAGES_EMPTY_CLASS: report.importantMessages.length ? '' : 'empty-section',
    IMPORTANT_MESSAGES: importantMessages,
    QUOTES_EMPTY_CLASS: report.quotes.length ? '' : 'empty-section',
    QUOTE_BLOCKS: quoteBlocks,
    QA_EMPTY_CLASS: report.qa.length ? '' : 'empty-section',
    QA_CARDS: qaCards,
    HEAT_BARS: heatBars,
    RANK_ITEMS: rankItems,
    ACTIVITY_TIMELINE: escapeHtml(report.analytics.activeTimeline),
    CLOUD_TAGS: cloudTags,
    GENERATED_AT: escapeHtml(metadata.generatedAt),
    FOOTER_NOTE: escapeHtml(metadata.footerNote)
  }
  for (const [key, value] of Object.entries(values)) html = replacePlaceholder(html, key, value)
  return html
}

const captureFullPage = async (htmlPath: string, pngPath: string): Promise<string> => {
  const reportWindow = new BrowserWindow({
    show: false,
    width: 430,
    height: 800,
    frame: false,
    backgroundColor: '#f3f5f7',
    webPreferences: { sandbox: true }
  })

  try {
    await reportWindow.loadFile(htmlPath)
    await reportWindow.webContents.executeJavaScript(`Promise.all([
      document.fonts.ready,
      ...Array.from(document.images).map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))
    ])`)
    reportWindow.webContents.debugger.attach('1.3')
    const metrics = (await reportWindow.webContents.debugger.sendCommand(
      'Page.getLayoutMetrics'
    )) as { cssContentSize: { width: number; height: number } }
    const width = Math.max(430, Math.ceil(metrics.cssContentSize.width))
    const height = Math.ceil(metrics.cssContentSize.height)
    const screenshot = (await reportWindow.webContents.debugger.sendCommand(
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
        fromSurface: true,
        clip: { x: 0, y: 0, width, height, scale: 1 }
      }
    )) as { data: string }
    const png = Buffer.from(screenshot.data, 'base64')
    if (png.length < 1000) throw new Error('生成的日报图片为空')
    await fs.writeFile(pngPath, png)
    return `data:image/png;base64,${screenshot.data}`
  } finally {
    if (reportWindow.webContents.debugger.isAttached()) {
      reportWindow.webContents.debugger.detach()
    }
    reportWindow.destroy()
  }
}

export const exportGroupReport = async (
  request: GroupReportExportRequest
): Promise<GroupReportExportResult> => {
  try {
    // === enrich 在 render 之前:从群成员快照反推真头像 ===
    await enrichAvatarsFromGroup(request.metadata)

    const outputDir = path.join(os.homedir(), 'Documents', '微信聊天记录')
    await fs.ensureDir(outputDir)
    const baseName = `${sanitizeFileName(request.metadata.groupName)}日报_${request.metadata.reportDate}_可视化长图`
    const htmlPath = path.join(outputDir, `${baseName}.html`)
    const pngPath = path.join(outputDir, `${baseName}.png`)
    const html = await renderReportHtml(request)
    await fs.writeFile(htmlPath, html, 'utf8')
    const imageDataUrl = await captureFullPage(htmlPath, pngPath)
    return {
      success: true,
      htmlPath,
      pngPath,
      imageDataUrl,
      warnings: request.metadata.warnings?.length ? request.metadata.warnings : undefined
    }
  } catch (error) {
    console.error('[GroupReport] export failed:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
