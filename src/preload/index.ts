import { contextBridge, ipcRenderer } from 'electron'

const api = {
  keychain: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('keychain:get', key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('keychain:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('keychain:delete', key)
  },
  config: {
    read: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('config:read'),
    write: (updates: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('config:write', updates)
  },
  permissions: {
    micStatus: (): Promise<string> => ipcRenderer.invoke('permissions:mic-status'),
    micRequest: (): Promise<boolean> => ipcRenderer.invoke('permissions:mic-request'),
    screenStatus: (): Promise<string> => ipcRenderer.invoke('permissions:screen-status')
  },
  shell: {
    openPrivacySettings: (pane: string): Promise<void> =>
      ipcRenderer.invoke('shell:open-privacy-settings', pane),
    openUrl: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-url', url)
  },
  app: {
    reset: (): Promise<void> => ipcRenderer.invoke('app:reset'),
    openDataFolder: (): Promise<void> => ipcRenderer.invoke('app:open-data-folder'),
    getDataPath: (): Promise<string> => ipcRenderer.invoke('app:get-data-path'),
    setTheme: (theme: 'light' | 'dark' | 'system'): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:set-theme', theme),
    getTheme: (): Promise<'light' | 'dark' | 'system'> => ipcRenderer.invoke('app:get-theme')
  },
  audio: {
    start: (): Promise<{ ok?: boolean; error?: string }> => ipcRenderer.invoke('audio:start'),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('audio:stop'),
    checkPermission: (): Promise<{ status: string; message?: string }> =>
      ipcRenderer.invoke('audio:check-permission'),
    onChunk: (cb: (buffer: ArrayBuffer) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, buf: ArrayBuffer) => cb(buf)
      ipcRenderer.on('audio:chunk', listener)
      return () => ipcRenderer.removeListener('audio:chunk', listener)
    },
    onStopped: (cb: (info: { code: number | null }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: { code: number | null }) => cb(info)
      ipcRenderer.on('audio:stopped', listener)
      return () => ipcRenderer.removeListener('audio:stopped', listener)
    },
    onPermissionDenied: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on('audio:permission-denied', listener)
      return () => ipcRenderer.removeListener('audio:permission-denied', listener)
    },
    onError: (cb: (msg: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
      ipcRenderer.on('audio:error', listener)
      return () => ipcRenderer.removeListener('audio:error', listener)
    }
  },
  session: {
    create: (data: { name?: string; docPaths?: string[]; notebookId?: string; mode?: string }): Promise<unknown> =>
      ipcRenderer.invoke('session:create', data),
    list: (): Promise<unknown[]> => ipcRenderer.invoke('session:list'),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke('session:get', id),
    update: (id: string, updates: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('session:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('session:delete', id),
    addCall: (id: string, call: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('session:add-call', id, call),
    updateCall: (sessionId: string, callIndex: number, updates: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('session:update-call', sessionId, callIndex, updates),
    saveSentiment: (sessionId: string, data: Record<string, unknown>): Promise<{ ok: boolean; filename: string }> =>
      ipcRenderer.invoke('session:save-sentiment', sessionId, data),
    loadSentiment: (sessionId: string, filename: string): Promise<unknown> =>
      ipcRenderer.invoke('session:load-sentiment', sessionId, filename),
    pickDocuments: (): Promise<string[]> => ipcRenderer.invoke('session:pick-documents')
  },
  knowledge: {
    loadDoc: (sessionId: string, filePath: string): Promise<{ ok?: boolean; chunks?: number; error?: string }> =>
      ipcRenderer.invoke('knowledge:load-doc', sessionId, filePath),
    query: (sessionId: string, queryText: string): Promise<Array<{ text: string; source: string; score: number }>> =>
      ipcRenderer.invoke('knowledge:query', sessionId, queryText),
    smartQuery: (sessionId: string, transcript: string): Promise<{ question: string; answer: string; source: string; confidence: string } | null> =>
      ipcRenderer.invoke('knowledge:smart-query', sessionId, transcript),
    detectQuestion: (transcript: string): Promise<string | null> =>
      ipcRenderer.invoke('knowledge:detect-question', transcript),
    status: (sessionId: string): Promise<{ documentCount: number; chunkCount: number; indexing: boolean }> =>
      ipcRenderer.invoke('knowledge:status', sessionId)
  },
  speaker: {
    detect: (transcript: string, existingNames: string[]): Promise<{ speakers: Array<{ name: string; context: string }> }> =>
      ipcRenderer.invoke('speaker:detect', transcript, existingNames),
    getColors: (): Promise<string[]> => ipcRenderer.invoke('speaker:get-colors')
  },
  followup: {
    add: (question: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('followup:add', question),
    list: (): Promise<string[]> => ipcRenderer.invoke('followup:list'),
    clear: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('followup:clear')
  },
  skill: {
    save: (skill: Record<string, unknown>): Promise<{ ok: boolean; skillId: string }> =>
      ipcRenderer.invoke('skill:save', skill),
    load: (skillId: string): Promise<unknown> => ipcRenderer.invoke('skill:load', skillId),
    list: (): Promise<unknown[]> => ipcRenderer.invoke('skill:list'),
    find: (contactName: string): Promise<unknown> => ipcRenderer.invoke('skill:find', contactName),
    delete: (skillId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('skill:delete', skillId)
  },
  audioBuffer: {
    status: (): Promise<{ enabled: boolean; micChunks: number; sysChunks: number; durationMs: number }> => ipcRenderer.invoke('audio-buffer:status'),
    stop: (): Promise<{ micFile: string | null; sysFile: string | null; durationMs: number }> => ipcRenderer.invoke('audio-buffer:stop'),
    delete: (micFile: string | null, sysFile: string | null): Promise<{ ok: boolean }> => ipcRenderer.invoke('audio-buffer:delete', micFile, sysFile),
    deepAnalyze: (micFile: string | null, sysFile: string | null, transcript: string): Promise<{ ok?: boolean; analysis?: unknown; error?: string }> => ipcRenderer.invoke('audio-buffer:deep-analyze', micFile, sysFile, transcript)
  },
  platformSkill: {
    get: (): Promise<unknown> => ipcRenderer.invoke('platform-skill:get'),
    recordSave: (source: string): Promise<void> => ipcRenderer.invoke('platform-skill:record-save', source),
    recordDismiss: (source: string, topic?: string): Promise<void> => ipcRenderer.invoke('platform-skill:record-dismiss', source, topic),
    recordSentimentOverride: (original: number, corrected: number, context: string): Promise<void> => ipcRenderer.invoke('platform-skill:record-sentiment-override', original, corrected, context),
    recordSummaryEdit: (desc: string): Promise<void> => ipcRenderer.invoke('platform-skill:record-summary-edit', desc),
    recordEntityCorrection: (type: 'false-positive' | 'missed', entity: string): Promise<void> => ipcRenderer.invoke('platform-skill:record-entity-correction', type, entity),
    incrementCalls: (): Promise<void> => ipcRenderer.invoke('platform-skill:increment-calls')
  },
  gemini: {
    testKey: (apiKey: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('gemini:test-key', apiKey),
    setKey: (apiKey: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('gemini:set-key', apiKey),
    removeKey: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('gemini:remove-key'),
    status: (): Promise<{ configured: boolean; audioBufferingEnabled: boolean }> => ipcRenderer.invoke('gemini:status'),
    toggleAudioBuffering: (enabled: boolean): Promise<{ ok: boolean }> => ipcRenderer.invoke('gemini:toggle-audio-buffering', enabled)
  },
  tavily: {
    search: (query: string): Promise<{ results: Array<{ title: string; content: string; url: string; score: number }>; answer?: string; error?: string }> =>
      ipcRenderer.invoke('tavily:search', query),
    testKey: (apiKey: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('tavily:test-key', apiKey),
    setKey: (apiKey: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('tavily:set-key', apiKey),
    removeKey: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('tavily:remove-key'),
    status: (): Promise<{ configured: boolean; hasKey: boolean }> => ipcRenderer.invoke('tavily:status')
  },
  notebooklm: {
    setup: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('notebooklm:setup'),
    onSetupProgress: (cb: (msg: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
      ipcRenderer.on('notebooklm:setup-progress', listener)
      return () => ipcRenderer.removeListener('notebooklm:setup-progress', listener)
    },
    login: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('notebooklm:login'),
    start: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('notebooklm:start'),
    stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('notebooklm:stop'),
    status: (): Promise<{ running: boolean; ready: boolean; installed: boolean; authenticated: boolean }> =>
      ipcRenderer.invoke('notebooklm:status'),
    listNotebooks: (): Promise<unknown> => ipcRenderer.invoke('notebooklm:list-notebooks'),
    createNotebook: (title: string): Promise<unknown> => ipcRenderer.invoke('notebooklm:create-notebook', title),
    uploadSource: (notebookId: string, filePath: string): Promise<unknown> =>
      ipcRenderer.invoke('notebooklm:upload-source', notebookId, filePath),
    addNote: (notebookId: string, title: string, content: string): Promise<unknown> =>
      ipcRenderer.invoke('notebooklm:add-note', notebookId, title, content),
    getInsights: (notebookId: string): Promise<unknown> => ipcRenderer.invoke('notebooklm:get-insights', notebookId),
    ask: (notebookId: string, question: string): Promise<unknown> =>
      ipcRenderer.invoke('notebooklm:ask', notebookId, question)
  }
}

contextBridge.exposeInMainWorld('translize', api)

export type TranslizeAPI = typeof api
