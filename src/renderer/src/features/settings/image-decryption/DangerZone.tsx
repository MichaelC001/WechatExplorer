import { useState } from 'react'

export function DangerZone({
  disabled,
  onClear
}: {
  disabled: boolean
  onClear: () => void
}): React.ReactElement {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <section className="database-key-danger image-key-danger">
        <h2>图片密钥管理</h2>
        <div>
          <span>
            <strong>清除图片密钥</strong>
            <small>聊天记录和微信原始图片不会被删除。</small>
          </span>
          <button disabled={disabled} onClick={() => setConfirming(true)}>
            清除图片密钥
          </button>
        </div>
      </section>
      {confirming ? (
        <div className="database-key-confirm-backdrop" role="presentation">
          <div className="database-key-confirm" role="dialog" aria-modal="true">
            <h2>确认清除图片解密配置？</h2>
            <p>清除后聊天记录仍然存在，但图片需要重新配置后才能解析。</p>
            <div>
              <button onClick={() => setConfirming(false)}>取消</button>
              <button
                className="danger"
                onClick={() => {
                  setConfirming(false)
                  onClear()
                }}
              >
                清除图片密钥
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
