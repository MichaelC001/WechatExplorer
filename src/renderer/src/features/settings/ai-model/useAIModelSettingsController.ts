import { useCallback, useEffect, useReducer } from 'react'
import type {
  AIProviderConfig,
  AIProviderSummary,
  AIRuntimeModelConfig
} from '../../../../../shared/ai-provider'
import { aiModelSettingsReducer, initialAIModelSettingsState } from './aiModelSettingsReducer'
import { createProviderFromPreset } from './presets'
import type { AIModelSettingsController } from './types'

export function useAIModelSettingsController({
  onRuntimeChange,
  onNotice
}: {
  onRuntimeChange: (config: AIRuntimeModelConfig) => void
  onNotice: (message: string) => void
}): AIModelSettingsController {
  const [state, dispatch] = useReducer(aiModelSettingsReducer, initialAIModelSettingsState)

  const refresh = useCallback(async (): Promise<void> => {
    const [list, runtime] = await Promise.all([
      window.api.listAIProviders(),
      window.api.getAIRuntimeConfig()
    ])
    if (!list.success) return dispatch({ type: 'ERROR', error: list.error || '供应商配置读取失败' })
    dispatch({ type: 'LOADED', providers: list.providers, runtime })
    onRuntimeChange(runtime)
  }, [onRuntimeChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openNew = useCallback(() => {
    dispatch({ type: 'OPEN_EDITOR', editor: createProviderFromPreset(), presetId: 'deepseek' })
  }, [])
  const openEdit = useCallback((provider: AIProviderSummary) => {
    dispatch({
      type: 'OPEN_EDITOR',
      editor: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: '',
        auth: provider.auth,
        models: provider.models,
        defaultModel: provider.defaultModel,
        advanced: provider.advanced
      },
      presetId: 'custom',
      originalProviderId: provider.id
    })
  }, [])
  const closeEditor = useCallback(() => dispatch({ type: 'CLOSE_EDITOR' }), [])
  const selectPreset = useCallback((presetId: string) => {
    dispatch({ type: 'OPEN_EDITOR', editor: createProviderFromPreset(presetId), presetId })
  }, [])
  const updateEditor = useCallback(
    (editor: AIProviderConfig) => dispatch({ type: 'EDIT', editor }),
    []
  )

  const save = useCallback(async (): Promise<void> => {
    if (!state.editor) return
    dispatch({ type: 'SAVE_START' })
    const result = await window.api.saveAIProvider(state.editor)
    if (!result.success) return dispatch({ type: 'ERROR', error: result.error || '供应商保存失败' })
    dispatch({ type: 'CLOSE_EDITOR' })
    await refresh()
    onNotice('AI 供应商已安全保存')
  }, [onNotice, refresh, state.editor])

  const remove = useCallback(
    async (providerId: string): Promise<void> => {
      if (!window.confirm('确认删除这个 AI 供应商？安全存储中的 API Key 也会一并清除。')) return
      const result = await window.api.deleteAIProvider(providerId)
      if (!result.success)
        return dispatch({ type: 'ERROR', error: result.error || '供应商删除失败' })
      await refresh()
      onNotice('AI 供应商已删除')
    },
    [onNotice, refresh]
  )

  const setDefault = useCallback(
    async (providerId: string): Promise<void> => {
      const result = await window.api.setDefaultAIProvider(providerId)
      if (!result.success)
        return dispatch({ type: 'ERROR', error: result.error || '默认模型更新失败' })
      await refresh()
      onNotice('默认 AI 模型已更新')
    },
    [onNotice, refresh]
  )

  const test = useCallback(
    async (providerId: string): Promise<void> => {
      dispatch({ type: 'TEST_START', providerId })
      const result = await window.api.testAIProvider(providerId)
      await refresh()
      onNotice(
        result.success
          ? `连接成功，耗时 ${result.latencyMs || 0} ms`
          : result.error || '连接测试失败'
      )
    },
    [onNotice, refresh]
  )

  return {
    state,
    openNew,
    openEdit,
    closeEditor,
    selectPreset,
    updateEditor,
    save,
    remove,
    setDefault,
    test
  }
}
