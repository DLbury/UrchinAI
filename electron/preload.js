'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,  // 'darwin' | 'win32' | 'linux'

  // ── Window controls (frameless mode) ─────────────────────────────────────
  windowMinimize: ()     => ipcRenderer.invoke('window:minimize'),
  windowMaximize: ()     => ipcRenderer.invoke('window:maximize'),
  windowClose: ()        => ipcRenderer.invoke('window:close'),
  windowIsMaximized: ()  => ipcRenderer.invoke('window:isMaximized'),

  // ── Active webview (called when tab focus changes) ────────────────────────
  setActiveWebview: (id)    => ipcRenderer.invoke('webview:setActive', id),
  updateTabState:   (state) => ipcRenderer.invoke('webview:updateState', state),

  // ── Commands pushed from main → renderer (AI bridge tab operations) ───────
  onCmdNewTab:        (cb) => { const handler = (_e, url)  => cb(url);  ipcRenderer.on('cmd:newTab',        handler); return () => ipcRenderer.removeListener('cmd:newTab', handler) },
  onCmdCloseTab:      (cb) => { const handler = ()         => cb();     ipcRenderer.on('cmd:closeTab',      handler); return () => ipcRenderer.removeListener('cmd:closeTab', handler) },
  onCmdSwitchTab:     (cb) => { const handler = (_e, id)   => cb(id);   ipcRenderer.on('cmd:switchTab',     handler); return () => ipcRenderer.removeListener('cmd:switchTab', handler) },
  onCmdRestoreSession:(cb) => { const handler = (_e, tabs) => cb(tabs); ipcRenderer.on('cmd:restoreSession',handler); return () => ipcRenderer.removeListener('cmd:restoreSession', handler) },
  onCmdNewSession:    (cb) => { const handler = ()         => cb();     ipcRenderer.on('cmd:newSession',    handler); return () => ipcRenderer.removeListener('cmd:newSession', handler) },
  onCmdAskAI:         (cb) => { const handler = (_e, text) => cb(text); ipcRenderer.on('cmd:askAI',         handler); return () => ipcRenderer.removeListener('cmd:askAI', handler) },

  // ── Ad blocking ───────────────────────────────────────────────────────────
  getAdBlockEnabled: ()        => ipcRenderer.invoke('adblock:getEnabled'),
  setAdBlockEnabled: (enabled) => ipcRenderer.invoke('adblock:setEnabled', enabled),

  // ── Agent FX (virtual cursor / animations) ────────────────────────────────
  getFXEnabled: ()        => ipcRenderer.invoke('fx:getEnabled'),
  setFXEnabled: (enabled) => ipcRenderer.invoke('fx:setEnabled', enabled),

  // ── Cookies ─────────────────────────────────────────────────────────────────
  getCookies:   (domain)    => ipcRenderer.invoke('cookies:get', domain),
  setCookie:   (opts)      => ipcRenderer.invoke('cookies:set', opts),
  removeCookie:(opts)      => ipcRenderer.invoke('cookies:remove', opts),
  clearAllCookies: ()       => ipcRenderer.invoke('cookies:clearAll'),

  // ── Sessions ──────────────────────────────────────────────────────────────
  saveSession:    (name) => ipcRenderer.invoke('session:save', name),
  getAllSessions: ()     => ipcRenderer.invoke('session:getAll'),
  deleteSession:  (id)  => ipcRenderer.invoke('session:delete', id),
  restoreSession: (id)  => ipcRenderer.invoke('session:restore', id),
  newSession:     ()    => ipcRenderer.invoke('session:new'),

  // ── Cross-tab analysis ────────────────────────────────────────────────────
  getAllTabsContent: () => ipcRenderer.invoke('tabs:getAllContent'),

  // ── DOM Element Picker ────────────────────────────────────────────────────
  startDomPicker: () => ipcRenderer.invoke('domPicker:start'),
  stopDomPicker: () => ipcRenderer.invoke('domPicker:stop'),
  removePickedBadge: (badgeNumber) => ipcRenderer.invoke('domPicker:removeBadge', badgeNumber),
  clearAllPickedBadges: () => ipcRenderer.invoke('domPicker:clearAllBadges'),
  onDomPicked: (callback) => {
    const handler = (_e, data) => callback(data)
    ipcRenderer.on('domPicker:picked', handler)
    return () => ipcRenderer.removeListener('domPicker:picked', handler)
  },

  // ── Context menu ──────────────────────────────────────────────────────────
  showContextMenu: (params) => ipcRenderer.invoke('context-menu:show', params),

  // ── Detach tab (drag to new window) ──────────────────────────────────────
  detachTab: (url, screenX, screenY, theme) => ipcRenderer.invoke('tab:detach', url, screenX, screenY, theme),

  // ── Shell ─────────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ── Find in page (Ctrl+F) ─────────────────────────────────────────────────
  findInPage: (text, options) => ipcRenderer.invoke('webview:findInPage', text, options),
  stopFindInPage: (action) => ipcRenderer.invoke('webview:stopFindInPage', action),
  onFoundInPage: (callback) => {
    const handler = (_e, result) => callback(result)
    ipcRenderer.on('webview:foundInPage', handler)
    return () => ipcRenderer.removeListener('webview:foundInPage', handler)
  },
  onFindShortcut: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:find', handler)
    return () => ipcRenderer.removeListener('shortcut:find', handler)
  },

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
