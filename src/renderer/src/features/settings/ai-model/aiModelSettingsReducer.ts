import type { AIModelSettingsAction, AIModelSettingsState } from './types'

export const initialAIModelSettingsState: AIModelSettingsState = {
  loading: true,
  saving: false,
  providers: [],
  runtime: null,
  editor: null,
  presetId: 'deepseek'
}

export function aiModelSettingsReducer(
  state: AIModelSettingsState,
  action: AIModelSettingsAction
): AIModelSettingsState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        loading: false,
        saving: false,
        testingId: undefined,
        providers: action.providers,
        runtime: action.runtime,
        error: undefined
      }
    case 'ERROR':
      return { ...state, loading: false, saving: false, testingId: undefined, error: action.error }
    case 'OPEN_EDITOR':
      return {
        ...state,
        editor: action.editor,
        presetId: action.presetId,
        originalProviderId: action.originalProviderId,
        error: undefined
      }
    case 'CLOSE_EDITOR':
      return { ...state, editor: null, originalProviderId: undefined, error: undefined }
    case 'EDIT':
      return { ...state, editor: action.editor, error: undefined }
    case 'SAVE_START':
      return { ...state, saving: true, error: undefined }
    case 'TEST_START':
      return { ...state, testingId: action.providerId, error: undefined }
    default:
      return state
  }
}
