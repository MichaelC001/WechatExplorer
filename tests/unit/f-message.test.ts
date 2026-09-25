import { describe, expect, it } from 'vitest'
import { describeFMessageScene, fMessageToContent, parseFMessageRow } from '../../src/shared/f-message'

describe('f-message parse', () => {
  it('maps friend request rows to system text', () => {
    const row = {
      user_name_: 'wxid_a',
      type_: 37,
      timestamp_: 1789633400,
      content_: '我是群里的劉',
      is_sender_: 0,
      scene_: 14,
      remark_: ''
    }
    expect(parseFMessageRow(row)).toMatchObject({ type: 37, scene: 14 })
    expect(fMessageToContent(row)).toMatchObject({
      type: 'system',
      content: '收到的好友申请 · wxid_a · 群聊：我是群里的劉'
    })
    expect(describeFMessageScene(15)).toBe('搜索/名片')
  })
})
