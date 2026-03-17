'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // ── Active webview (called when tab focus changes) ────────────────────────
  setActiveWebview: (id)    => ipcRenderer.invoke('webview:setActive', id),
  updateTabState:   (state) => ipcRenderer.invoke('webview:updateState', state),

  // ── Commands pushed from main → renderer (AI bridge tab operations) ───────
  onCmdNewTab:        (cb) => { ipcRenderer.on('cmd:newTab',        (_e, url)  => cb(url));  return () => ipcRenderer.removeAllListeners('cmd:newTab') },
  onCmdCloseTab:      (cb) => { ipcRenderer.on('cmd:closeTab',      ()         => cb());     return () => ipcRenderer.removeAllListeners('cmd:closeTab') },
  onCmdSwitchTab:     (cb) => { ipcRenderer.on('cmd:switchTab',     (_e, id)   => cb(id));   return () => ipcRenderer.removeAllListeners('cmd:switchTab') },
  onCmdRestoreSession:(cb) => { ipcRenderer.on('cmd:restoreSession',(_e, tabs) => cb(tabs)); return () => ipcRenderer.removeAllListeners('cmd:restoreSession') },

  // ── Ad blocking ───────────────────────────────────────────────────────────
  getAdBlockEnabled: ()        => ipcRenderer.invoke('adblock:getEnabled'),
  setAdBlockEnabled: (enabled) => ipcRenderer.invoke('adblock:setEnabled', enabled),

  // ── Agent FX (virtual cursor / animations) ────────────────────────────────
  getFXEnabled: ()        => ipcRenderer.invoke('fx:getEnabled'),
  setFXEnabled: (enabled) => ipcRenderer.invoke('fx:setEnabled', enabled),

  // ── Sessions ──────────────────────────────────────────────────────────────
  saveSession:    (name) => ipcRenderer.invoke('session:save', name),
  getAllSessions: ()     => ipcRenderer.invoke('session:getAll'),
  deleteSession:  (id)  => ipcRenderer.invoke('session:delete', id),
  restoreSession: (id)  => ipcRenderer.invoke('session:restore', id),

  // ── Context menu ──────────────────────────────────────────────────────────
  showContextMenu: (params) => ipcRenderer.invoke('context-menu:show', params),

  // ── Detach tab (drag to new window) ──────────────────────────────────────
  detachTab: (url, screenX, screenY, theme) => ipcRenderer.invoke('tab:detach', url, screenX, screenY, theme),

  // ── Shell ─────────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ── Backend lifecycle ─────────────────────────────────────────────────────
  onBackendReady: (cb) => {
    ipcRenderer.on('backend:ready', () => cb())
    return () => ipcRenderer.removeAllListeners('backend:ready')
  },

  // ── API proxy (bypasses CORS when loading from app://) ─────────────────────
  apiRequest: (method, path, body) => ipcRenderer.invoke('api:request', { method, path, body }),

  // ── WebSocket proxy (bypasses app:// origin restriction for ws://) ───────
  wsConnect: (sessionId)    => ipcRenderer.invoke('ws:connect', sessionId),
  wsDisconnect: (sessionId) => ipcRenderer.invoke('ws:disconnect', sessionId),
  wsSend: (sessionId, data) => ipcRenderer.invoke('ws:send', sessionId, data),
  onWsMessage: (callback) => {
    const handler = (_e, msg) => callback(msg)
    ipcRenderer.on('ws:message', handler)
    return () => ipcRenderer.removeListener('ws:message', handler)
  },
  onWsStatus: (callback) => {
    const handler = (_e, status) => callback(status)
    ipcRenderer.on('ws:status', handler)
    return () => ipcRenderer.removeListener('ws:status', handler)
  },
})
