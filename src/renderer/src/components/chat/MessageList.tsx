import React from 'react'
import { Contact, Message } from '../../../../shared/types'
import { MessageGroup } from './MessageGroup'
import { buildMessageGroups } from './messageGrouping'

interface MessageListProps {
  contact: Contact
  messages: Message[]
  hiddenMessageCount: number
  isLoadingMessages?: boolean
  isGroupChat: boolean
  showAvatar: boolean
  listRef: React.RefObject<HTMLDivElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void
  onImageClick: (imageUrl: string) => void
}

export function MessageList({
  contact,
  messages,
  hiddenMessageCount,
  isLoadingMessages,
  isGroupChat,
  showAvatar,
  listRef,
  bottomRef,
  onScroll,
  onImageClick
}: MessageListProps): React.ReactElement {
  const groups = React.useMemo(() => buildMessageGroups(messages), [messages])

  return (
    <div className="message-list wechat-message-list" ref={listRef} onScroll={onScroll}>
      {isLoadingMessages && <div className="message-loading-pill">正在加载聊天记录...</div>}
      {hiddenMessageCount > 0 && (
        <div className="wechat-system-message-row">
          <div className="wechat-system-message">
            已隐藏较早的 {hiddenMessageCount} 条消息，当前显示最新 {messages.length} 条
          </div>
        </div>
      )}
      {groups.map((group) => (
        <MessageGroup
          key={group.id}
          group={group}
          contact={contact}
          isGroupChat={isGroupChat}
          showAvatar={showAvatar}
          onImageClick={onImageClick}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
