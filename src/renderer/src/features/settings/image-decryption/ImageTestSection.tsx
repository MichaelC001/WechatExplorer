import type { ImageDecryptionState } from './types'

export function ImageTestSection({
  state,
  disabled,
  canSave,
  onSelect,
  onTest,
  onSave
}: {
  state: ImageDecryptionState
  disabled: boolean
  canSave: boolean
  onSelect: (value: string) => void
  onTest: () => void
  onSave: () => void
}): React.ReactElement {
  const result = state.testResult
  return (
    <section className="settings-card image-test-section">
      <div>
        <strong>图片解析测试</strong>
        <p>选择一条聊天记录测试图片解密能力。</p>
      </div>
      <label htmlFor="image-test-chat">聊天记录</label>
      <select
        id="image-test-chat"
        value={state.selectedUserMd5}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="">请选择会话</option>
        {state.contacts.map((contact) => (
          <option key={contact.md5} value={contact.md5}>
            {contact.m_nsNickName || contact.m_nsUsrName}
          </option>
        ))}
      </select>
      <div className="image-test-actions">
        <button
          className="database-key-primary"
          disabled={disabled || !state.selectedUserMd5}
          onClick={onTest}
        >
          {state.phase === 'testing' ? '正在测试…' : '测试图片解析'}
        </button>
        <button className="database-key-secondary" disabled={!canSave} onClick={onSave}>
          确认保存
        </button>
      </div>
      {result ? (
        <div className={`image-test-result ${result.success ? 'success' : 'error'}`}>
          <span>{result.fileFound ? '✓' : '×'} 找到图片文件</span>
          <span>{result.decrypted ? '✓' : '×'} 解密成功</span>
          <span>{result.readable ? '✓' : '×'} 图片可以读取</span>
          {!result.success ? <p>{result.error}</p> : null}
        </div>
      ) : state.error ? (
        <p className="image-inline-error">{state.error}</p>
      ) : null}
    </section>
  )
}
