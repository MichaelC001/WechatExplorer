function ShieldIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 19 6v5.8c0 4.5-3 7.5-7 8.7-4-1.2-7-4.2-7-8.7V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

export function LocalPrivacyNotice(): React.ReactElement {
  return (
    <section className="settings-privacy-notice">
      <ShieldIcon />
      <div>
        <strong>数据仅在本机读取</strong>
        <p>WechatExplorer 不会将您的微信聊天数据上传到云端。所有解析和存储均在本地完成。</p>
      </div>
    </section>
  )
}
