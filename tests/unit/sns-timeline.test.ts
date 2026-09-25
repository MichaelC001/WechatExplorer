import { describe, expect, it } from 'vitest'
import {
  parseSnsMessageRow,
  parseSnsTimelineXml,
  snsPostDisplayText,
  snsRowToContent
} from '../../src/shared/sns-timeline'

describe('sns timeline parse', () => {
  it('parses TimelineObject contentDesc into text', () => {
    const xml = [
      '<SnsDataItem><TimelineObject>',
      '<id>15013093137131319961</id>',
      '<username>wxid_a</username>',
      '<createTime>1789700166</createTime>',
      '<contentDesc><![CDATA[早买早享受]]></contentDesc>',
      '</TimelineObject></SnsDataItem>'
    ].join('')
    const post = parseSnsTimelineXml(xml)
    expect(post).toMatchObject({
      username: 'wxid_a',
      createTime: 1789700166,
      text: '早买早享受'
    })
    expect(snsRowToContent({ content: xml })).toMatchObject({
      type: 'text',
      content: '早买早享受'
    })
  })

  it('maps url timeline to share card', () => {
    const xml = [
      '<SnsDataItem><TimelineObject>',
      '<createTime>1789700000</createTime>',
      '<contentDesc>标题</contentDesc>',
      '<url><![CDATA[https://example.com/a]]></url>',
      '</TimelineObject></SnsDataItem>'
    ].join('')
    expect(snsRowToContent({ content: xml })).toMatchObject({
      type: 'share',
      title: '标题',
      url: 'https://example.com/a',
      typeVal: 'sns'
    })
  })

  it('attaches SnsMessage comments and like counts to display text', () => {
    const post = parseSnsTimelineXml(
      '<SnsDataItem><TimelineObject><createTime>1789700166</createTime><contentDesc>正文</contentDesc></TimelineObject></SnsDataItem>'
    )
    post.comments = [
      parseSnsMessageRow({ type: 2, feed_id: 1, from_nickname: 'A', content: '不错', del_status: 0 }),
      parseSnsMessageRow({ type: 2, feed_id: 1, from_nickname: 'B', content: '已删', del_status: 1 })
    ]
    post.likeCount = 3
    const text = snsPostDisplayText(post)
    expect(text).toContain('正文')
    expect(text).toContain('（3 赞）')
    expect(text).toContain('A：不错')
    expect(text).not.toContain('已删')
  })
})
