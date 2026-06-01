import React, { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Message, Contact } from '../../../shared/types'

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
  const [showAvatar, setShowAvatar] = useState(false)

  const [colWidths, setColWidths] = useState([150, 100, 180, 400])
  const [resizingColIndex, setResizingColIndex] = useState<number | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

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

  const startResizing = (index: number, e: React.MouseEvent): void => {
    e.preventDefault()
    setResizingColIndex(index)
    startXRef.current = e.clientX
    startWidthRef.current = colWidths[index]

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent): void => {
    if (resizingColIndex === null) return
    const diff = e.clientX - startXRef.current
    const newWidth = Math.max(50, startWidthRef.current + diff)

    setColWidths((prev) => {
      const newCols = [...prev]
      newCols[resizingColIndex] = newWidth
      return newCols
    })
  }

  const handleMouseUp = (): void => {
    setResizingColIndex(null)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
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
        const { img, id, isSender, ...rest } = msg
        return rest
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
      const filterTypes = (import.meta.env.VITE_FILTER_MSG_TYPES || '分享消息,图片,表情包,视频')
        .split(',')
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

      <div className="message-list">
        <table className="chat-table" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: colWidths[0], position: 'relative' }}>
                发送者
                <div className="column-resizer" onMouseDown={(e) => startResizing(0, e)} />
              </th>
              <th style={{ width: colWidths[1], position: 'relative' }}>
                类型
                <div className="column-resizer" onMouseDown={(e) => startResizing(1, e)} />
              </th>
              <th style={{ width: colWidths[2], position: 'relative' }}>
                时间
                <div className="column-resizer" onMouseDown={(e) => startResizing(2, e)} />
              </th>
              <th style={{ width: colWidths[3] }}>内容</th>
            </tr>
          </thead>
          <tbody>
            {visibleMessages.map((msg) => (
              <tr key={msg.id}>
                <td
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={msg.from}
                >
                  {msg.from}
                </td>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {msg.type}
                </td>
                <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {msg.datetime}
                </td>
                <td style={{ wordBreak: 'break-all', display: 'flex', alignItems: 'center' }}>
                  {showAvatar && msg?.img && (
                    <img style={{ width: '40px', height: '40px' }} src={msg?.img}></img>
                  )}
                  <div
                    style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      display: !showAvatar ? 'flex' : 'block'
                    }}
                  >
                    {(msg.name || contact.m_nsNickName) && (
                      <div style={{ display: 'flex', fontSize: 18 }}>
                        {isGroupChat ? msg.name : msg.from === 'user' ? contact.m_nsNickName : '我'}
                        <span>{isGroupChat ? (msg.name ? ':' : '') : ':'} </span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 18,
                        background: '#fff',
                        margin: 4,
                        padding: 4,
                        borderRadius: '4px'
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
