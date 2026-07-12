export function SettingsEmptyState({ label }: { label: string }): React.ReactElement {
  return (
    <div className="settings-empty-state">
      <h2>{label}</h2>
      <p>该设置将在后续阶段接入。</p>
    </div>
  )
}
