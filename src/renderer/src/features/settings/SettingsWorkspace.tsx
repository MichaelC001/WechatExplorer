import { SettingsEmptyState } from './components/SettingsEmptyState'
import { SettingsSidebar } from './components/SettingsSidebar'
import { SETTINGS_CATEGORY_LABELS } from './model/settingsNavigation'
import type { SettingsCategoryId, SettingsSelfInfo } from './model/types'
import { AccountDatabasePage } from './pages/AccountDatabasePage'
import { DatabaseKeyPage } from './pages/DatabaseKeyPage'
import { ImageDecryptionPage } from './pages/ImageDecryptionPage'
import { AIModelPage } from './pages/AIModelPage'
import type { Contact } from '../../../../shared/types'
import type { AIRuntimeModelConfig } from '../../../../shared/ai-provider'

export function SettingsWorkspace({
  selectedCategory,
  onCategoryChange,
  selfInfo,
  dbReady,
  dbKey,
  onDbKeyChange,
  onDatabaseConnectionChange,
  onSelfInfoChange,
  onContactsChange,
  onFilteredContactsChange,
  onAIRuntimeChange,
  onNotice,
  onOpenSettings
}: {
  selectedCategory: SettingsCategoryId
  onCategoryChange: (id: SettingsCategoryId) => void
  selfInfo: SettingsSelfInfo | null
  dbReady: boolean
  dbKey: string
  onDbKeyChange: (key: string) => void
  onDatabaseConnectionChange: (connected: boolean) => void
  onSelfInfoChange: (info: SettingsSelfInfo | null) => void
  onContactsChange: (contacts: Contact[]) => void
  onFilteredContactsChange: (contacts: Contact[]) => void
  onAIRuntimeChange: (config: AIRuntimeModelConfig) => void
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
          onNotice={onNotice}
        />
      ) : selectedCategory === 'database-key' ? (
        <DatabaseKeyPage
          dbKey={dbKey}
          dbReady={dbReady}
          selfInfo={selfInfo}
          onDbKeyChange={onDbKeyChange}
          onDatabaseConnectionChange={onDatabaseConnectionChange}
          onSelfInfoChange={onSelfInfoChange}
          onContactsChange={onContactsChange}
          onFilteredContactsChange={onFilteredContactsChange}
          onNotice={onNotice}
        />
      ) : selectedCategory === 'image-key' ? (
        <ImageDecryptionPage selfInfo={selfInfo} onNotice={onNotice} />
      ) : selectedCategory === 'ai-model' ? (
        <AIModelPage onRuntimeChange={onAIRuntimeChange} onNotice={onNotice} />
      ) : (
        <SettingsEmptyState label={SETTINGS_CATEGORY_LABELS[selectedCategory]} />
      )}
    </div>
  )
}
