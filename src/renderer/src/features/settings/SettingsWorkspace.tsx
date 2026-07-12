import { SettingsEmptyState } from './components/SettingsEmptyState'
import { SettingsSidebar } from './components/SettingsSidebar'
import { SETTINGS_CATEGORY_LABELS } from './model/settingsNavigation'
import type { SettingsCategoryId, SettingsSelfInfo } from './model/types'
import { AccountDatabasePage } from './pages/AccountDatabasePage'

export function SettingsWorkspace({
  selectedCategory,
  onCategoryChange,
  selfInfo,
  dbReady,
  dbKey,
  onConnectionChanged,
  onNotice,
  onOpenSettings
}: {
  selectedCategory: SettingsCategoryId
  onCategoryChange: (id: SettingsCategoryId) => void
  selfInfo: SettingsSelfInfo | null
  dbReady: boolean
  dbKey: string
  onConnectionChanged: () => void
  onNotice: (message: string) => void
  onOpenSettings: () => void
}): React.ReactElement {
  return (
    <div className="settings-workspace">
      <SettingsSidebar
        selectedId={selectedCategory}
        onSelect={onCategoryChange}
        selfInfo={selfInfo}
        dbReady={dbReady}
        onOpenSettings={onOpenSettings}
      />
      {selectedCategory === 'account-database' ? (
        <AccountDatabasePage
          dbKey={dbKey}
          dbReady={dbReady}
          selfInfo={selfInfo}
          onConnectionChanged={onConnectionChanged}
          onNotice={onNotice}
        />
      ) : (
        <SettingsEmptyState label={SETTINGS_CATEGORY_LABELS[selectedCategory]} />
      )}
    </div>
  )
}
