import React, { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Message, Contact } from '../../../shared/types'
import { VoicePlayer } from './VoicePlayer'
import { RichMessageBubble } from './RichMessageBubble'
import { ImageBubble } from './ImageBubble'

interface ChatWindowProps {
  contact: Contact | null
  messages: Message[]
  contentFilter?: string
  onRefresh?: () => void
  onRefreshData?: () => void
}

const systemPrompt = `你是一个中文的群聊总结的助手，你可以为一个微信的群聊记录，提取并总结每个时间段大家在重点讨论的话题内容。
请注意 不要回复总结除外的内容, 并且不要输出 群友的wxid  微信id 只需要显示群名称
请帮我将给出的群聊内容总结成一个群聊报告，需要你生成7个最重要 最火爆的话题的总结（如果还有更多话题，可以在后面简单补充）。每个话题包含以下内容：
- 整体评价
    - 话题名(50字以内，带序号1️⃣2️⃣3️⃣，同时附带热度，以🔥数量表示）
        - 参与者(不超过5个人，将重复的人名去重)
        - 注意按时间排序，时间段(从日期几点到几点)
    - 过程(50到200字左右）
        - 评价(50字以下)
        - 生成这7天内热度最高的话题，27日到2日一共7天 
需要生成27, 28, 29, 30, 31, 1, 2日的话题总结
    - 分割线： ------------

    另外有以下要求：
        1. 每个话题结束使用------------分割
2. 使用中文冒号
3. 无需大标题
4. 开始给出本群讨论风格的整体评价，例如活跃、太水、太黄、太暴力、话题不集中、无聊诸如此类
5. 每个话题详细写出参与者

最后总结下今日最活跃的前五个发言者`

const ChatWindow: React.FC<ChatWindowProps> = ({
  contact,
  messages,
  contentFilter,
  onRefresh,
  onRefreshData
}) => {
  const isGroupChat = contact?.type === 'group' || contact?.m_nsUsrName?.endsWith('@chatroom')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [imageScale, setImageScale] = useState(0.75)
  const [imageRotation, setImageRotation] = useState(0)
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 })
  const imageDragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null
  )
  const [showAvatar, setShowAvatar] = useState(true)

  // AI Settings
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_api_key') || '')
  const [baseURL, setBaseURL] = useState(
    () => localStorage.getItem('ai_base_url') || 'https://api.deepseek.com'
  )
  const [model, setModel] = useState(() => localStorage.getItem('ai_model') || 'deepseek-chat')

  const handleSaveSettings = (): void => {
    localStorage.setItem('ai_api_key', apiKey)
    localStorage.setItem('ai_base_url', baseURL)
    localStorage.setItem('ai_model', model)
    setShowSettingsModal(false)
    AIChat()
  }

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const openImagePreview = (imageUrl: string): void => {
    setPreviewImage(imageUrl)
    setImageScale(0.75)
    setImageRotation(0)
    setImageOffset({ x: 0, y: 0 })
  }

  const closeImagePreview = (): void => {
    setPreviewImage(null)
    imageDragRef.current = null
  }

  const zoomImage = (delta: number): void => {
    setImageScale((prev) => Math.min(3, Math.max(0.25, Number((prev + delta).toFixed(2)))))
  }

  const resetImageTransform = (): void => {
    setImageScale(0.75)
    setImageRotation(0)
    setImageOffset({ x: 0, y: 0 })
  }

  const handleViewerWheel = (event: React.WheelEvent): void => {
    event.preventDefault()
    zoomImage(event.deltaY > 0 ? -0.1 : 0.1)
  }

  const handleViewerMouseDown = (event: React.MouseEvent): void => {
    event.preventDefault()
    imageDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: imageOffset.x,
      offsetY: imageOffset.y
    }
  }

  const handleViewerMouseMove = (event: React.MouseEvent): void => {
    if (!imageDragRef.current) return
    const drag = imageDragRef.current
    setImageOffset({
      x: drag.offsetX + event.clientX - drag.x,
      y: drag.offsetY + event.clientY - drag.y
    })
  }

  const handleViewerMouseUp = (): void => {
    imageDragRef.current = null
  }

  const handleExport = (days: number | 'all'): void => {
    if (!messages.length) return

    let filtered = messages
    if (days !== 'all') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

      filtered = messages.filter((m) => {
        const parsed = new Date(m.datetime).getTime()
        if (isNaN(parsed)) return true

        if (days === 0) {
          // 今天
          return parsed >= startOfDay
        } else if (days === 1) {
          // 昨天
          const startOfYesterday = startOfDay - 86400000
          return parsed >= startOfYesterday && parsed < startOfDay
        } else if (days === 7) {
          // 过去 7 天
          const startOf7DaysAgo = startOfDay - 7 * 86400000
          return parsed >= startOf7DaysAgo
        } else if (days === 30) {
          // 过去 30 天
          const startOf30DaysAgo = startOfDay - 30 * 86400000
          return parsed >= startOf30DaysAgo
        }
        return true
      })
    }

    const headers = ['发送者', '类型', '时间', '内容']
    const csvContent = [
      headers.join(','),
      ...filtered.map((m) => {
        let prefix = ''
        if (isGroupChat) {
          prefix = m.name ? `${m.name}: ` : ''
        } else {
          const name = m.from === 'user' ? contact?.m_nsNickName || '未知' : '我'
          prefix = `${name}: `
        }
        const fullContent = `${prefix}${m.content}`
        const content = fullContent.replace(/"/g, '""').replace(/\n/g, ' ')
        return `"${m.from}","${m.type}","${m.datetime}","${content}"`
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${contact?.m_nsNickName || 'chat'}_export.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const [summaryContent, setSummaryContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const AIChat = async (): Promise<void> => {
    if (!messages || messages.length === 0) {
      alert('当前没有消息可供总结')
      return
    }
    const filteredMessages = messages
      .filter((msg) => !'分享消息,图片,表情包,视频'.split(',').includes(msg.type))
      .map((msg) => {
        return {
          from: msg.from,
          type: msg.type,
          datetime: msg.datetime,
          content: msg.content,
          name: msg.name
        }
      })
    const recentMessages = filteredMessages
      .map((msg) => {
        return `${msg.datetime} ${msg.from}: ${msg.content}`
      })
      .join('\n')

    const prompt = `请总结以下微信聊天记录的核心内容：\n\n${recentMessages}`

    setIsLoading(true)
    try {
      console.log('正在请求AI...')
      const result = await window.api.aiChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        { apiKey, model, baseURL }
      )

      if (result.success && result.data) {
        console.log('AI Summary:', result.data)
        setSummaryContent(result.data)

        // 等待状态更新和渲染
        setTimeout(() => {
          textToImage()
          setIsLoading(false) // 图片生成开始后停止加载
        }, 500)
      } else {
        console.error('AI Error:', result.error)
        alert(`AI 请求失败: ${result.error}`)
        setIsLoading(false)
      }
    } catch (error) {
      console.error('AI Call Failed:', error)
      alert('AI 请求发生错误')
      setIsLoading(false)
    }
  }

  const textToImage = async (): Promise<void> => {
    if (imageContainerRef.current) {
      try {
        const dataUrl = await toPng(imageContainerRef.current, {
          cacheBust: true,
          backgroundColor: '#ffffff',
          style: {
            transform: 'scale(1)'
          }
        })
        if (dataUrl && dataUrl.length > 100) {
          setGeneratedImage(dataUrl)
        } else {
          alert('生成图片为空')
        }
      } catch (err) {
        console.error('Failed to generate image', err)
        alert('生成图片失败: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }
  const handleCopyImage = async (): Promise<void> => {
    if (!generatedImage) return
    const result = await window.api.copyImage(generatedImage)
    if (result.success) {
      alert('复制成功')
    }
  }

  const [displayLimit, setDisplayLimit] = useState(100)

  const filteredMessages = React.useMemo(() => {
    return messages.filter((msg) => {
      const filterTypes = (import.meta.env.VITE_FILTER_MSG_TYPES || '')
        .split(',')
        .map((type) => type.trim())
        .filter(Boolean)
      const typeMatch = !filterTypes.includes(msg.type)
      const contentMatch = !contentFilter || msg.content.includes(contentFilter)
      return typeMatch && contentMatch
    })
  }, [messages, contentFilter])

  const visibleMessages = filteredMessages.slice(0, displayLimit)

  if (!contact) {
    return (
      <div className="chat-window">
        <div className="empty-state">选择一条消息</div>
      </div>
    )
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h2>{contact.m_nsNickName}</h2>
        <div className="window-controls"></div>
      </div>

      <div className="message-list wechat-message-list">
        {visibleMessages.map((msg) => {
          const isMine = msg.from === 'assistant'
          const displayName = isMine
            ? '我'
            : isGroupChat
              ? msg.name || msg.from
              : contact.m_nsNickName
          const avatarSrc = isMine ? msg.img : msg.img || contact.avatar
          const isVoice = msg.type === '语音'
          const isImage = msg.type === '图片'
          const isRichMedia = ['名片', '位置', '分享消息', '通话', '表情包'].includes(msg.type)

          return (
            <div key={msg.id} className={`wechat-message-row ${isMine ? 'mine' : 'other'}`}>
              {!isMine && showAvatar && (
                <div className="message-avatar">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={displayName} referrerPolicy="no-referrer" />
                  ) : (
                    (displayName || '?').charAt(0)
                  )}
                </div>
              )}
              <div className="message-stack">
                {!isMine && isGroupChat && <div className="message-sender-name">{displayName}</div>}
                <div
                  className={`message-bubble ${isVoice ? 'voice-bubble' : ''} ${isImage ? 'image-message-bubble' : ''}`}
                >
                  {isVoice && msg.sessionId ? (
                    <VoicePlayer
                      sessionId={msg.sessionId}
                      localId={msg.localId || 0}
                      createTime={msg.createTime || 0}
                    />
                  ) : isImage && msg.contentData && msg.contentData.type === 'image' ? (
                    <ImageBubble
                      imageMd5={msg.contentData.md5}
                      imageDatName={msg.contentData.datName}
                      sessionId={msg.sessionId}
                      onImageClick={openImagePreview}
                    />
                  ) : isRichMedia && msg.contentData ? (
                    <RichMessageBubble contentData={msg.contentData} />
                  ) : (
                    <div className="message-text">{msg.content}</div>
                  )}
                </div>
                <div className="message-meta">
                  <span>{msg.datetime}</span>
                  <span>{msg.type}</span>
                </div>
              </div>
              {isMine && showAvatar && (
                <div className="message-avatar mine-avatar">
                  {avatarSrc ? <img src={avatarSrc} alt="我" referrerPolicy="no-referrer" /> : '我'}
                </div>
              )}
            </div>
          )
        })}
        {filteredMessages.length > displayLimit && (
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <button
              onClick={() => setDisplayLimit((prev) => prev + 100)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              加载更多 ({filteredMessages.length - displayLimit} 条剩余)
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-toolbar">
        <label
          style={{ marginRight: '10px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={showAvatar}
            onChange={(e) => setShowAvatar(e.target.checked)}
            style={{ marginRight: '5px' }}
          />
          显示头像
        </label>
        <button className="toolbar-btn" onClick={onRefresh}>
          🔄 刷新聊天记录
        </button>
        <button className="toolbar-btn" onClick={onRefreshData}>
          🔄 刷新数据
        </button>
        <button className="toolbar-btn" onClick={() => handleExport('all')}>
          📤 导出全部
        </button>
        <button className="toolbar-btn" onClick={() => handleExport(0)}>
          🕒 导出今日
        </button>
        <button className="toolbar-btn" onClick={() => handleExport(1)}>
          📅 导出昨日
        </button>
        <button className="toolbar-btn" onClick={() => handleExport(7)}>
          📅 导出近7天
        </button>
        <button className="toolbar-btn" onClick={() => handleExport(30)}>
          📅 导出近30天
        </button>
        <button className="toolbar-btn" onClick={() => setShowSettingsModal(true)}>
          🤖 AI总结群聊
        </button>
      </div>

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: 'hidden',
          zIndex: -1
        }}
      >
        <div
          style={{
            width: '820px',
            padding: '20px',
            backgroundColor: '#fff',
            fontSize: '22px',
            color: '#000',
            whiteSpace: 'pre-wrap',
            fontFamily: 'sans-serif',
            lineHeight: '1.5'
          }}
          ref={imageContainerRef}
        >
          {summaryContent}
        </div>
      </div>

      {/* 加载模态框 */}
      {isLoading && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', minWidth: '200px' }}>
            <div style={{ fontSize: '40px', marginBottom: '20px' }}>🤖</div>
            <div style={{ fontSize: '16px', color: '#333' }}>正在生成 AI 总结...</div>
            <div style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
              请稍候，生成后将自动转换为图片
            </div>
          </div>
        </div>
      )}

      {/* 图片预览模态框 */}
      {generatedImage && (
        <div className="modal-overlay" onClick={() => setGeneratedImage(null)}>
          <div className="modal-content image-preview-modal" onClick={(e) => e.stopPropagation()}>
            <img
              src={generatedImage}
              alt="Generated Summary"
              style={{ maxWidth: '100%', maxHeight: '80vh', border: '1px solid #ccc' }}
            />
            <div
              style={{
                marginTop: '10px',
                display: 'flex',
                // justifyContent: 'flex-end',
                gap: '10px'
              }}
            >
              <button
                onClick={handleCopyImage}
                style={{
                  padding: '8px 15px',
                  cursor: 'pointer',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                📋 复制图片
              </button>
              <button
                onClick={() => setGeneratedImage(null)}
                style={{ padding: '5px 10px', cursor: 'pointer' }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="image-viewer-overlay" onClick={closeImagePreview}>
          <div className="image-viewer-window" onClick={(e) => e.stopPropagation()}>
            <div className="image-viewer-titlebar">
              <div className="image-viewer-tools">
                <span className="image-viewer-title">图片查看</span>
                <button onClick={() => zoomImage(-0.1)} title="缩小">
                  −
                </button>
                <span className="image-viewer-zoom">{Math.round(imageScale * 100)}%</span>
                <button onClick={() => zoomImage(0.1)} title="放大">
                  +
                </button>
                <span className="image-viewer-divider" />
                <button onClick={() => setImageRotation((prev) => prev - 90)} title="左旋转">
                  ↶
                </button>
                <button onClick={() => setImageRotation((prev) => prev + 90)} title="右旋转">
                  ↷
                </button>
                <button onClick={resetImageTransform} title="重置">
                  ⟲
                </button>
              </div>
              <button className="image-viewer-close" onClick={closeImagePreview} aria-label="关闭">
                ×
              </button>
            </div>
            <div
              className="image-viewer-stage"
              onWheel={handleViewerWheel}
              onMouseDown={handleViewerMouseDown}
              onMouseMove={handleViewerMouseMove}
              onMouseUp={handleViewerMouseUp}
              onMouseLeave={handleViewerMouseUp}
            >
              <img
                src={previewImage}
                alt="图片预览"
                draggable={false}
                style={{
                  transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageScale}) rotate(${imageRotation}deg)`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>AI 设置</h3>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>模型服务:</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                <option value="moonshot-v1-8k">Moonshot V1</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Base URL:</label>
              <input
                type="text"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://api.deepseek.com"
                style={{ width: '95%', padding: '8px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>API Key:</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API Key"
                style={{ width: '95%', padding: '8px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowSettingsModal(false)}>取消</button>
              <button
                onClick={handleSaveSettings}
                style={{
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px'
                }}
              >
                生成总结
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default ChatWindow
