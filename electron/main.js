'use strict'

const { app, BrowserWindow, ipcMain, shell, session: electronSession, webContents, Menu, clipboard, protocol, net } = require('electron')
const path   = require('path')
const http   = require('http')
const fs     = require('fs')
const os     = require('os')
const { pathToFileURL } = require('url')
const { spawn, execSync } = require('child_process')

const isDev        = !app.isPackaged

// Register app:// protocol for packaged mode (fixes blank window on Linux - file:// blocks ES modules)
// secure: false so ws://127.0.0.1 is not blocked as mixed content when connecting to agent
if (!isDev) {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'app',
    privileges: { standard: true, secure: false, supportFetchAPI: true },
  }])
}
const RENDERER_URL = isDev ? 'http://localhost:5174' : null
const BACKEND_PORT = 8001
const BRIDGE_PORT  = 8002

let mainWindow  = null
let backendProc = null
let adBlockEnabled = true
/** Set true after Python backend responds to health check (used for late-opened windows). */
let backendHealthReady = false

// Active webview per renderer window (set by renderer whenever tab changes)
// key: BrowserWindow.webContents.id (renderer) -> value: webview guest webContentsId
const activeWebContentsByWindow = new Map()

// Partition for webviews (must be defined before use in createWindow/detachTab)
const NANOBOT_PARTITION = 'persist:urchin'

// ─── Nanobot Agent FX (injected into webviews) ────────────────────────────────

let fxEnabled = false  // toggled from SettingsModal

const NANOBOT_FX_SCRIPT = `
(function() {
  if (window.__nbFX) return; // already injected this page-load

  /* ── Inject styles ── */
  const S = document.createElement('style');
  S.textContent = \`
    #__nb-wrap { position:fixed; top:0; left:0; width:0; height:0; pointer-events:none; z-index:2147483647; }

    /* ── Sci-fi targeting cursor ── */
    #__nb-cur {
      position: fixed; display: none; pointer-events: none;
      z-index: 2147483647;
      width: 32px; height: 32px;
      margin-left: -16px; margin-top: -16px;
      transition: left 0.28s cubic-bezier(.4,0,.2,1), top 0.28s cubic-bezier(.4,0,.2,1);
      transform-origin: center center;
    }
    /* center glowing dot */
    #__nb-cur::before {
      content: '';
      position: absolute; left: 50%; top: 50%;
      width: 6px; height: 6px;
      margin: -3px 0 0 -3px;
      background: #22d3ee;
      border-radius: 50%;
      box-shadow: 0 0 10px 3px rgba(34,211,238,0.9), 0 0 22px 6px rgba(34,211,238,0.45);
    }
    /* outer rotating arc ring */
    #__nb-cur::after {
      content: '';
      position: absolute; inset: 0;
      border: 2.5px solid rgba(34,211,238,0.9);
      border-radius: 50%;
      border-top-color: transparent;
      border-bottom-color: rgba(99,102,241,0.6);
      box-shadow: 0 0 12px rgba(34,211,238,0.5), inset 0 0 10px rgba(34,211,238,0.15);
      animation: __nb-cur-spin 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    /* secondary counter-rotating ring */
    #__nb-cur i {
      position: absolute; inset: 5px;
      border: 1.5px solid rgba(129,140,248,0.5);
      border-radius: 50%;
      border-left-color: transparent;
      border-right-color: rgba(34,211,238,0.7);
      animation: __nb-cur-spin 3.5s linear infinite reverse;
    }
    @keyframes __nb-cur-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    #__nb-cur.nb-click {
      animation: __nb-cur-click 0.35s ease-out forwards;
    }
    @keyframes __nb-cur-click {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.5); }
      60%  { transform: scale(0.85); }
      100% { transform: scale(1); }
    }

    /* ── Click ripple ring ── */
    .nb-ripple {
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2.5px solid rgba(34,211,238,0.9);
      border-radius: 50%;
      box-shadow: 0 0 14px rgba(34,211,238,0.6);
      animation: __nb-ripple-anim 0.55s ease-out forwards;
    }
    @keyframes __nb-ripple-anim {
      0%   { width:6px; height:6px; margin:-3px 0 0 -3px; opacity:1; }
      100% { width:56px; height:56px; margin:-28px 0 0 -28px; opacity:0; }
    }

    /* ── Element highlights ── */
    .__nb-hl {
      outline: 2.5px solid #22d3ee !important; outline-offset: 3px !important;
      background-color: rgba(34,211,238,0.12) !important;
      border-radius: 4px !important; transition: all 0.12s ease !important;
    }
    .__nb-hl-type {
      outline: 2.5px solid #34d399 !important; outline-offset: 3px !important;
      background-color: rgba(52,211,153,0.10) !important;
      border-radius: 4px !important; transition: all 0.12s ease !important;
    }

    /* ── Numbered labels ── */
    .__nb-lbl {
      position: absolute !important; pointer-events: none !important;
      background: rgba(34,211,238,0.93); color: #0f172a;
      font: 700 10px/1.5 monospace; padding: 0 5px; border-radius: 4px;
      z-index: 2147483645; box-shadow: 0 0 10px rgba(34,211,238,0.5);
      animation: __nb-lbl-in 0.14s ease;
    }
    @keyframes __nb-lbl-in { from { opacity:0; transform:scale(.6); } to { opacity:1; transform:scale(1); } }

    /* ── Scan flash ── */
    .__nb-scan {
      animation: __nb-scan-anim 0.55s ease-out forwards !important;
    }
    @keyframes __nb-scan-anim {
      0%   { outline: 1px solid rgba(34,211,238,.8) !important; background-color: rgba(34,211,238,.18) !important; }
      100% { outline: 1px solid rgba(34,211,238,0)  !important; background-color: transparent !important; }
    }

    /* ── Action toast ── */
    #__nb-toast {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: rgba(8,12,28,0.90); color: #e2e8f0;
      padding: 8px 20px; border-radius: 999px;
      font: 600 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;
      z-index: 2147483644; pointer-events: none;
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(34,211,238,0.32);
      box-shadow: 0 4px 28px rgba(0,0,0,0.45);
      white-space: nowrap; max-width: 440px; overflow: hidden; text-overflow: ellipsis;
      opacity: 0; transition: opacity 0.16s ease;
    }
    #__nb-toast.nb-show { opacity: 1; }
  \`;
  (document.head || document.documentElement).appendChild(S);

  /* ── Build persistent sci-fi cursor ── */
  const cur = document.createElement('div');
  cur.id = '__nb-cur';
  cur.innerHTML = \`<i></i>\`;
  document.body.appendChild(cur);

  /* ── Toast element ── */
  const toast = document.createElement('div');
  toast.id = '__nb-toast';
  document.body.appendChild(toast);
  let toastTimer = null;

  function showToast(msg, ms = 2200) {
    toast.textContent = msg; toast.classList.add('nb-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('nb-show'), ms);
  }

  /* ── Highlight helpers ── */
  let hlEls = [];
  function clearHL() { hlEls.forEach(e => e.classList.remove('__nb-hl','__nb-hl-type')); hlEls = []; }
  function hlEl(el, type) {
    clearHL(); el.classList.add(type==='type' ? '__nb-hl-type' : '__nb-hl');
    hlEls.push(el); setTimeout(clearHL, 2200);
  }

  /* ── Label helpers ── */
  let lblEls = [];
  function clearLabels() { lblEls.forEach(e => e.remove()); lblEls = []; }

  /* ── Ripple helper ── */
  function spawnRipple(x, y) {
    const r = document.createElement('div');
    r.className = 'nb-ripple';
    r.style.left = x + 'px'; r.style.top = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  /* ── Public API ── */
  window.__nbFX = {
    navigate(url) {
      showToast('🌐 ' + url.replace(/^https?:\\/\\//, '').slice(0, 55), 3000);
    },

    scanDOM(count) {
      showToast('🔍 分析页面结构 · ' + count + ' 个可交互元素', 2500);
      document.querySelectorAll('[data-nanobot-id]').forEach(e => {
        e.classList.add('__nb-scan');
        setTimeout(() => e.classList.remove('__nb-scan'), 600);
      });
    },

    showLabels() {
      clearLabels();
      const body = document.body;
      document.querySelectorAll('[data-nanobot-id]').forEach(el => {
        const id = el.getAttribute('data-nanobot-id');
        const r  = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const lbl = document.createElement('div');
        lbl.className = '__nb-lbl';
        lbl.textContent = id;
        lbl.style.left = (window.scrollX + r.left) + 'px';
        lbl.style.top  = (window.scrollY + r.top)  + 'px';
        body.appendChild(lbl); lblEls.push(lbl);
      });
      setTimeout(clearLabels, 4500);
    },

    /* Move cursor to (startX,startY) then animate to (x,y) and click */
    click(x, y, label, elId, fromX, fromY) {
      /* 1. Appear at previous position (or offscreen) */
      if (fromX !== undefined) {
        cur.style.transition = 'none';
        cur.style.left = fromX + 'px'; cur.style.top = fromY + 'px';
        cur.style.display = 'block';
        void cur.offsetWidth;
      } else {
        cur.style.display = 'block';
      }
      /* 2. Smooth glide to target */
      cur.style.transition = 'left 0.28s cubic-bezier(.4,0,.2,1), top 0.28s cubic-bezier(.4,0,.2,1)';
      cur.style.left = x + 'px'; cur.style.top = y + 'px';

      /* 3. After glide, trigger click animation + ripple */
      setTimeout(() => {
        cur.classList.remove('nb-click'); void cur.offsetWidth;
        cur.classList.add('nb-click');
        spawnRipple(x, y);
        if (elId !== undefined) {
          const t = document.querySelector('[data-nanobot-id="' + elId + '"]');
          if (t) hlEl(t, 'click');
        }
        showToast('👆 ' + label);
        setTimeout(() => cur.classList.remove('nb-click'), 400);
      }, 300);
    },

    type(text, elId) {
      if (elId !== undefined) {
        const t = document.querySelector('[data-nanobot-id="' + elId + '"]');
        if (t) hlEl(t, 'type');
      }
      showToast('⌨️  ' + text.slice(0, 45));
    },

    pressKey(key) { showToast('⌨️  ' + key, 1400); },

    /* Return current cursor center so next action can animate FROM here */
    cursorPos() {
      if (cur.style.display === 'none') return null;
      return { x: parseFloat(cur.style.left)||0, y: parseFloat(cur.style.top)||0 };
    },
  };
})();
`

// Track last cursor position per webContents id, so glide can animate from prev position
const cursorPos = new Map()   // wcId → {x, y}

async function ensureFX(wc) {
  if (!fxEnabled) return
  try { await wc.executeJavaScript(NANOBOT_FX_SCRIPT) } catch (_) {}
}

async function fxCursorPos(wc) {
  if (!fxEnabled) return null
  try {
    const pos = await wc.executeJavaScript(`window.__nbFX ? window.__nbFX.cursorPos() : null`)
    return pos
  } catch (_) { return null }
}

// Tab state cache per renderer window (updated by renderer, consumed by bridge /tabs)
// key: BrowserWindow.webContents.id (renderer) -> { tabs, activeId }
const tabStateByWindow = new Map()

// ─── Sessions ────────────────────────────────────────────────────────────────

const SESSIONS_FILE  = path.join(os.homedir(), '.nanobot', 'sessions.json')
const SETTINGS_FILE  = path.join(os.homedir(), '.nanobot', 'app-settings.json')

function loadAppSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
      if (typeof s.adBlock === 'boolean') adBlockEnabled = s.adBlock
      if (typeof s.agentFX === 'boolean') fxEnabled      = s.agentFX
    }
  } catch (_) {}
}

function saveAppSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ adBlock: adBlockEnabled, agentFX: fxEnabled }, null, 2), 'utf8')
  } catch (_) {}
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))
  } catch (_) {}
  return []
}

function saveSessions(data) {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true })
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (_) {}
}

// ─── Ad blocking ─────────────────────────────────────────────────────────────

const AD_DOMAINS = [
  'doubleclick.net','googlesyndication.com','googleadservices.com','adservice.google.com',
  'adnxs.com','rubiconproject.com','pubmatic.com','openx.net','adsrvr.org',
  'criteo.com','criteo.net','taboola.com','outbrain.com','revcontent.com',
  'amazon-adsystem.com','adsafeprotected.com','moatads.com','scorecardresearch.com',
  'chartbeat.com','quantserve.com','comscore.com','zedo.com','advertising.com',
  'adroll.com','mathtag.com','bidswitch.net','casalemedia.com','appnexus.com',
  'sharethrough.com','sovrn.com','lijit.com','spotxchange.com','teads.tv',
  'yieldmo.com','undertone.com','kargo.com','intentiq.com','33across.com',
  'adskeeper.com','ads-twitter.com','ads.linkedin.com','static.ads-twitter.com',
]

function setupAdBlocking(sess) {
  sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (!adBlockEnabled) { callback({ cancel: false }); return }
    try {
      const hostname = new URL(details.url).hostname.replace(/^www\./, '')
      const blocked = AD_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
      callback({ cancel: blocked })
    } catch (_) {
      callback({ cancel: false })
    }
  })
}

// ─── Python backend ───────────────────────────────────────────────────────────

function startBackend() {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend')

  console.log('[backend] Checking for bundled backend...')
  console.log('[backend] resourcesPath:', process.resourcesPath)
  console.log('[backend] backendDir:', backendDir)

  const bundledBackend = app.isPackaged && (() => {
    const base = path.join(process.resourcesPath, 'backend')
    console.log('[backend] Looking in:', base)

    // List files in backend directory
    try {
      const files = fs.readdirSync(base)
      console.log('[backend] Files found:', files)
    } catch (e) {
      console.log('[backend] Cannot read directory:', e.message)
    }

    if (process.platform === 'win32') {
      const exe = path.join(base, 'urchinai-backend.exe')
      console.log('[backend] Checking for Windows exe:', exe, 'exists:', fs.existsSync(exe))
      return fs.existsSync(exe) ? exe : null
    }
    if (process.platform === 'linux') {
      const bin = path.join(base, 'urchinai-backend')
      console.log('[backend] Checking for Linux binary:', bin, 'exists:', fs.existsSync(bin))
      return fs.existsSync(bin) ? bin : null
    }
    return null
  })()

  if (bundledBackend) {
    try {
      if (process.platform === 'win32') {
        execSync(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${BACKEND_PORT}"') do taskkill /f /pid %a`, { stdio: 'ignore' })
      } else {
        execSync(`fuser -k ${BACKEND_PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore' })
      }
    } catch (_) {}
    console.log('[backend] Starting bundled backend:', bundledBackend)
    backendProc = spawn(bundledBackend, [], {
      cwd: path.dirname(bundledBackend),
      stdio: isDev ? 'inherit' : 'ignore',
      windowsHide: true,
      detached: false,
    })
    backendProc.on('error', (err) => console.error('[backend] Failed to start:', err.message))
    backendProc.on('exit', (c) => { if (c != null && c !== 0) console.log('[backend] exit code', c) })
    return
  }

  // Dev or Linux / Windows without bundled exe: run via system Python
  console.log('[backend] No bundled backend found, trying system Python...')

  if (!fs.existsSync(backendDir)) {
    console.error('[backend] Backend directory not found:', backendDir)
    return
  }

  try {
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${BACKEND_PORT}"') do taskkill /f /pid %a`, { stdio: 'ignore' })
    } else {
      execSync(`fuser -k ${BACKEND_PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore' })
    }
  } catch (_) {}

  const spawnOpts = {
    cwd: backendDir,
    stdio: isDev ? 'inherit' : 'ignore',
    windowsHide: true,
    detached: false,
  }

  function tryStartWindows() {
    const port = String(BACKEND_PORT)
    const tryCmd = (shellCmd) => {
      const proc = spawn('cmd', ['/c', shellCmd], { ...spawnOpts, windowsHide: true })
      proc.on('error', (err) => console.error('[backend] Failed to start:', err.message))
      proc.on('exit', (c) => { if (c !== 0 && c != null) console.log('[backend] exit code', c) })
      return proc
    }
    const cmd1 = `py -3 -m uvicorn main:app --host 127.0.0.1 --port ${port}`
    backendProc = tryCmd(cmd1)
    let fallbackDone = false
    backendProc.on('exit', (c) => {
      if (fallbackDone) return
      if ((c === 1 || c === 9009) && backendProc) {
        fallbackDone = true
        const cmd2 = `python -m uvicorn main:app --host 127.0.0.1 --port ${port}`
        console.log('[backend] Retry with python:', cmd2)
        backendProc = tryCmd(cmd2)
      }
    })
  }

  if (process.platform === 'win32') {
    console.log('[backend] Starting Python backend from:', backendDir)
    tryStartWindows()
  } else {
    console.log('[backend] Starting Python backend from:', backendDir)
    backendProc = spawn('python3',
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
      spawnOpts)
    backendProc.on('error', (err) => console.error('[backend] Failed to start:', err))
    backendProc.on('exit', (c) => console.log('[backend] exit', c))
  }
}

function stopBackend() {
  backendProc?.kill(); backendProc = null
}

// ─── HTTP bridge (Python → webview control) ──────────────────────────────────

function isSafeHttpUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'about:'
  } catch {
    return false
  }
}

function getActiveWc() {
  const focused = BrowserWindow.getFocusedWindow() || mainWindow
  const rendererWcId = focused?.webContents?.id
  const activeId = rendererWcId ? activeWebContentsByWindow.get(rendererWcId) : null
  if (!activeId) return null
  try { return webContents.fromId(activeId) } catch (_) { return null }
}

/** BrowserWindow that embeds this guest page, or the shell window for top-level webContents. */
function browserWindowForPageContents(pageWc) {
  if (!pageWc || pageWc.isDestroyed()) return null
  let w = BrowserWindow.fromWebContents(pageWc)
  if (w) return w
  const host = pageWc.hostWebContents
  if (host && !host.isDestroyed()) return BrowserWindow.fromWebContents(host)
  return null
}

function broadcastToAllRenderers(channel, ...args) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

function focusedOrMainShell() {
  return BrowserWindow.getFocusedWindow() || mainWindow
}

function isAllowedBridgeOrigin(origin) {
  if (!origin) return false
  return origin.startsWith('app://') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
}

function startBridgeServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    const origin = req.headers.origin || ''
    if (isAllowedBridgeOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }

    // Tab-management endpoints don't need an active wc
    const noWcNeeded = ['/tabs', '/new-tab', '/close-tab', '/switch-tab']
    const wc = getActiveWc()

    if (!wc && !noWcNeeded.includes(req.url)) {
      res.writeHead(503); res.end(JSON.stringify({ error: 'no active webview' })); return
    }

    let body = ''
    const MAX_BODY = 10 * 1024 * 1024 // 10 MB
    req.on('data', d => {
      body += d
      if (body.length > MAX_BODY) {
        req.destroy()
      }
    })
    req.on('end', async () => {
      let data = {}
      try { data = JSON.parse(body || '{}') } catch (_) {}

      try {
        // ── Navigation ──────────────────────────────────────────────────
        if (req.method === 'POST' && req.url === '/navigate') {
          if (!isSafeHttpUrl(data.url)) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'invalid url' })); return
          }
          try {
            await wc.loadURL(data.url)
          } catch (e) {
            // ERR_ABORTED (-3) is normal for redirect chains — ignore it and
            // let did-finish-load signal completion instead
            if (e.errno !== -3 && e.code !== 'ERR_ABORTED') throw e
          }
          // Wait up to 8 s for did-finish-load so the page is interactive before responding
          await new Promise(resolve => {
            const done = () => resolve()
            wc.once('did-finish-load', done)
            setTimeout(done, 8000)
          })
          await ensureFX(wc)
          if (fxEnabled) await wc.executeJavaScript(`window.__nbFX && window.__nbFX.navigate(${JSON.stringify(data.url)})`).catch(()=>{})
          res.end(JSON.stringify({ ok: true, title: wc.getTitle() }))

        // ── Get URL ─────────────────────────────────────────────────────
        } else if (req.method === 'GET' && req.url === '/url') {
          res.end(JSON.stringify({ url: wc.getURL() }))

        // ── DOM serialization (page-agent style numbered elements) ──────
        } else if (req.method === 'GET' && req.url === '/get-dom') {
          await ensureFX(wc)
          const dom = await wc.executeJavaScript(`
            (function() {
              // ── cleanup old ids ──
              document.querySelectorAll('[data-nanobot-id]').forEach(el => el.removeAttribute('data-nanobot-id'));

              const vw = window.innerWidth, vh = window.innerHeight;
              const seen = new Set();
              const descs = [];

              // ── React patch: mark root elements non-interactive ──
              document.querySelectorAll('[data-reactroot], [data-reactid], [data-react-checksum], #root, #app, [id^="root-"], [id^="app-"]').forEach(el => {
                el.setAttribute('data-nanobot-not-interactive', 'true');
              });

              // ── visibility ──
              const isVisible = (el) => {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return false;
                if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return false;
                const st = window.getComputedStyle(el);
                if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) return false;
                return true;
              };

              // ── occlusion check (lightweight) ──
              const isTopElement = (el) => {
                const r = el.getBoundingClientRect();
                const pts = [
                  {x: r.left + r.width*0.5, y: r.top + r.height*0.5},
                  {x: r.left + Math.min(4, r.width*0.2), y: r.top + Math.min(4, r.height*0.2)},
                  {x: r.right - Math.min(4, r.width*0.2), y: r.bottom - Math.min(4, r.height*0.2)}
                ];
                for (const p of pts) {
                  if (p.x < 0 || p.y < 0 || p.x > vw || p.y > vh) continue;
                  const top = document.elementFromPoint(p.x, p.y);
                  if (el === top || el.contains(top)) return true;
                }
                return false;
              };

              const isDisabled = (el) => el.disabled || el.readOnly || el.inert || el.getAttribute('aria-disabled') === 'true';

              // ── cursor heuristics (page-agent style) ──
              const INTERACTIVE_CURSORS = new Set([
                'pointer','move','text','grab','grabbing','cell','copy','alias','all-scroll',
                'zoom-in','zoom-out','col-resize','row-resize','nw-resize','n-resize','ne-resize',
                'e-resize','se-resize','s-resize','sw-resize','w-resize','ns-resize','ew-resize',
                'nesw-resize','nwse-resize'
              ]);
              const NON_INTERACTIVE_CURSORS = new Set(['not-allowed','no-drop','wait','progress','help','context-menu']);

              const styleCache = new WeakMap();
              const getStyle = (el) => {
                if (styleCache.has(el)) return styleCache.get(el);
                const st = window.getComputedStyle(el);
                styleCache.set(el, st);
                return st;
              };

              // ── class heuristic ──
              const INTERACTIVE_CLASS_RE = /\\b(btn|button|clickable|menu|item|entry|link|tab|nav|dropdown|toggle|selectable|interactive)\\b/i;

              // ── scrollable detection ──
              const isScrollable = (el) => {
                const st = getStyle(el);
                const overflow = (st.overflow + st.overflowY + st.overflowX);
                if (!/auto|scroll/.test(overflow)) return false;
                return (el.scrollHeight > el.clientHeight + 4) || (el.scrollWidth > el.clientWidth + 4);
              };

              // ── inline events fallback ──
              const hasInlineEvents = (el) => !!(el.onclick || el.onmousedown || el.onmouseup || el.ondblclick || el.onkeydown || el.onkeyup || el.onchange || el.oninput || el.onfocus || el.onblur);

              // ── add element ──
              const addEl = (el, reason) => {
                if (seen.has(el) || !isVisible(el)) return;
                // Only skip the element itself if marked non-interactive (e.g. React root wrappers)
                if (el.hasAttribute('data-nanobot-not-interactive')) return;
                if (isDisabled(el)) return;

                // For heuristic reasons, do a lightweight top-element check
                if (reason !== 'semantic' && !isTopElement(el)) return;

                // Extra sanity for empty cursor-based divs
                if (reason === 'cursor' || reason === 'class-heuristic') {
                  const tag = el.tagName.toLowerCase();
                  if ((tag === 'div' || tag === 'span') && !el.textContent.trim() && !INTERACTIVE_CLASS_RE.test(el.className) && !el.getAttribute('role') && !el.getAttribute('tabindex')) {
                    if (!hasInlineEvents(el)) return;
                  }
                }

                seen.add(el);
                const idx = descs.length;
                el.setAttribute('data-nanobot-id', String(idx));
                const tag  = el.tagName.toLowerCase();
                const type = el.getAttribute('type') || '';
                const role = el.getAttribute('role') || '';
                const ph   = el.getAttribute('placeholder') || '';
                const lbl  = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                const nm   = el.getAttribute('name') || '';
                const txt  = (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,80);
                const val  = (el.value||'').slice(0,40);
                const href = (el.getAttribute('href')||'').slice(0,60);
                let d = '['+idx+'] ';
                if (tag==='input') {
                  const t = type||'text';
                  if (t==='submit'||t==='button') d += 'Button: '+(val||txt||lbl||nm||'submit');
                  else if (t==='checkbox'||t==='radio') d += (t==='checkbox'?'Checkbox':'Radio')+(el.checked?' ✓':' ○')+': '+(lbl||nm||txt);
                  else { d += 'Input['+t+']'; if(ph) d+=' placeholder="'+ph+'"'; if(lbl) d+=' label="'+lbl+'"'; if(val) d+=' value="'+val+'"'; }
                } else if (tag==='textarea') {
                  d += 'Textarea'; if(ph) d+=' placeholder="'+ph+'"'; if(val) d+=' (current: "'+val+'")';
                } else if (tag==='select') {
                  const sel = el.options[el.selectedIndex];
                  d += 'Select '+(lbl||nm);
                  if(sel) d+=' (selected: "'+sel.text+'")';
                  d += ' [options: '+Array.from(el.options).slice(0,6).map(o=>o.text).join(' | ')+']';
                } else if (tag==='a') {
                  d += 'Link: '+(txt||lbl); if(href&&!href.startsWith('#')) d+=' → '+href;
                } else {
                  d += (role==='button'||tag==='button'?'Button: ':'Elem: ')+(txt||lbl||role);
                }
                if (isScrollable(el)) d += ' [scrollable]';
                descs.push(d);
              };

              // 1. Semantic selectors
              const SEL = [
                'a[href]:not([href=""])',
                'button:not([disabled])',
                'input:not([type="hidden"]):not([disabled])',
                'select:not([disabled])',
                'textarea:not([disabled])',
                '[role="button"]:not([disabled])',
                '[role="link"]','[role="checkbox"]','[role="radio"]',
                '[role="menuitem"]','[role="tab"]','[role="option"]',
                '[role="combobox"]','[role="searchbox"]','[role="textbox"]',
                '[role="listbox"]','[role="slider"]','[role="spinbutton"]',
                '[role="switch"]','[role="scrollbar"]',
                '[contenteditable="true"]',
                'details','summary','label','fieldset','legend',
                '[aria-haspopup="true"]','[aria-expanded]',
              ].join(',');
              document.querySelectorAll(SEL).forEach(el => addEl(el, 'semantic'));

              // 2. Cursor heuristic
              document.querySelectorAll('body *').forEach(el => {
                if (seen.has(el)) return;
                try {
                  const c = getStyle(el).cursor;
                  if (INTERACTIVE_CURSORS.has(c) && !NON_INTERACTIVE_CURSORS.has(c)) addEl(el, 'cursor');
                } catch (e) {}
              });

              // 3. Tabindex
              document.querySelectorAll('[tabindex]:not([tabindex="-1"])').forEach(el => {
                if (!seen.has(el)) addEl(el, 'tabindex');
              });

              // 4. Inline events
              document.querySelectorAll('*[onclick],*[onmousedown],*[onmouseup],*[ondblclick]').forEach(el => {
                if (!seen.has(el)) addEl(el, 'event');
              });

              // 5. Class heuristic
              document.querySelectorAll('body *').forEach(el => {
                if (seen.has(el)) return;
                if (INTERACTIVE_CLASS_RE.test(el.className)) addEl(el, 'class-heuristic');
              });

              // 6. Scrollable containers
              document.querySelectorAll('body *').forEach(el => {
                if (seen.has(el)) return;
                if (isScrollable(el)) addEl(el, 'scrollable');
              });

              // 7. AntD patch: promote hidden select inputs to visible wrapper
              document.querySelectorAll('.ant-select input[role="combobox"]').forEach(el => {
                if (!isVisible(el)) {
                  const wrapper = el.closest('.ant-select');
                  if (wrapper && isVisible(wrapper) && !seen.has(wrapper)) addEl(wrapper, 'antd-select');
                }
              });

              // Body text
              const clone = document.body.cloneNode(true);
              clone.querySelectorAll('script,style,noscript,nav,footer,header,[aria-hidden="true"],[data-nanobot-not-interactive]')
                .forEach(e=>e.remove());
              const bodyText = (clone.innerText||'').replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,3000);

              return {
                title: document.title,
                url: location.href,
                viewportWidth: vw,
                viewportHeight: vh,
                scrollY: window.scrollY,
                pageHeight: document.documentElement.scrollHeight,
                elementCount: descs.length,
                elements: descs,
                bodyText
              };
            })()
          `)
          if (fxEnabled) await wc.executeJavaScript(
            `window.__nbFX && (window.__nbFX.scanDOM(${dom.elementCount}), window.__nbFX.showLabels())`
          ).catch(() => {})
          res.end(JSON.stringify(dom))

        // ── Click ───────────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/click') {
          await ensureFX(wc)
          const pos = await wc.executeJavaScript(`
            (function() {
              const q = ${JSON.stringify(data.selector || '')};
              let el = null;
              // @N  →  element stamped by /get-dom
              if (/^@\\d+$/.test(q)) {
                el = document.querySelector('[data-nanobot-id="'+q.slice(1)+'"]');
              }
              // CSS selector
              if (!el) { try { el = document.querySelector(q); } catch(e) {} }
              // Fuzzy text / label / placeholder match
              if (!el) {
                const cands = document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"],[tabindex]');
                for (const c of cands) {
                  const t   = (c.textContent||'').trim();
                  const lbl = (c.getAttribute('aria-label')||'').trim();
                  const ph  = (c.getAttribute('placeholder')||'').trim();
                  const val = (c.getAttribute('value')||'').trim();
                  if (t===q||lbl===q||ph===q||val===q||t.includes(q)||lbl.includes(q)) { el=c; break; }
                }
              }
              if (!el) return null;
              el.scrollIntoView({ block: 'center', inline: 'nearest' });
              const r = el.getBoundingClientRect();
              if (r.width===0 && r.height===0) return null;

              // Dispatch full W3C pointer/mouse event sequence for SPA compatibility
              const x = Math.round(r.left + r.width/2);
              const y = Math.round(r.top + r.height/2);
              const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y };
              const optsNoBubble = { bubbles: false, cancelable: false, clientX: x, clientY: y, screenX: x, screenY: y };
              el.dispatchEvent(new PointerEvent('pointerover', opts));
              el.dispatchEvent(new MouseEvent('mouseover', opts));
              el.dispatchEvent(new PointerEvent('pointerenter', optsNoBubble));
              el.dispatchEvent(new MouseEvent('mouseenter', optsNoBubble));
              el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, button: 0, buttons: 1 }));
              el.dispatchEvent(new MouseEvent('mousedown', { ...opts, button: 0, buttons: 1 }));
              if (el.focus) el.focus();

              return { x, y, tag: el.tagName, text: (el.textContent||'').trim().slice(0,60) };
            })()
          `)
          if (!pos) {
            res.end(JSON.stringify({ ok: false, error: `Element not found: ${data.selector}` }))
          } else {
            if (fxEnabled) {
              // Get previous cursor position so we can animate the glide path
              const prev = await fxCursorPos(wc)
              const elId = /^@(\d+)$/.test(data.selector) ? data.selector.slice(1) : undefined
              const fromArgs = prev ? `, ${prev.x}, ${prev.y}` : ''
              await wc.executeJavaScript(
                `window.__nbFX && window.__nbFX.click(${pos.x}, ${pos.y}, ${JSON.stringify(pos.text)}, ${elId !== undefined ? elId : 'undefined'}${fromArgs})`
              ).catch(() => {})
              await new Promise(r => setTimeout(r, 320)) // let cursor glide + animation settle
            }
            wc.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y })
            wc.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
            wc.sendInputEvent({ type: 'mouseUp',   x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
            // Also dispatch pointerup/mouseup/click via JS to complete the sequence for frameworks
            await wc.executeJavaScript(`
              (function() {
                const q = ${JSON.stringify(data.selector || '')};
                let el = null;
                if (/^@\\d+$/.test(q)) el = document.querySelector('[data-nanobot-id="'+q.slice(1)+'"]');
                if (!el) { try { el = document.querySelector(q); } catch(e) {} }
                if (!el) return;
                const r = el.getBoundingClientRect();
                const x = Math.round(r.left + r.width/2);
                const y = Math.round(r.top + r.height/2);
                const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y };
                el.dispatchEvent(new PointerEvent('pointerup', { ...opts, button: 0, buttons: 0 }));
                el.dispatchEvent(new MouseEvent('mouseup', { ...opts, button: 0, buttons: 0 }));
                el.click();
              })()
            `).catch(() => {})
            res.end(JSON.stringify({ ok: true, element: `${pos.tag}: ${pos.text}`, x: pos.x, y: pos.y }))
          }

        // ── Type ────────────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/type') {
          await ensureFX(wc)
          const ok = await wc.executeJavaScript(`
            (function() {
              const q    = ${JSON.stringify(data.selector || '')};
              const text = ${JSON.stringify(data.text || '')};
              let el = null;
              // @N  →  element stamped by /get-dom
              if (/^@\\d+$/.test(q)) {
                el = document.querySelector('[data-nanobot-id="'+q.slice(1)+'"]');
              }
              if (!el) { try { el = document.querySelector(q); } catch(e) {} }
              if (!el) {
                for (const c of document.querySelectorAll('input,textarea,[contenteditable="true"]')) {
                  const ph  = (c.getAttribute('placeholder')||'').trim();
                  const lbl = (c.getAttribute('aria-label')||'').trim();
                  const nm  = (c.getAttribute('name')||'').trim();
                  if (ph===q||lbl===q||nm===q) { el=c; break; }
                }
              }
              if (!el) return false;
              el.scrollIntoView({ block: 'center', inline: 'nearest' });
              el.focus();
              el.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
              if (el.isContentEditable) {
                // Synthetic input first, then fallback to execCommand
                el.innerText = text;
                el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
                // Verify fallback
                if (el.innerText !== text) {
                  document.execCommand('selectAll', false, null);
                  document.execCommand('insertText', false, text);
                }
              } else {
                const nativeSetter = Object.getOwnPropertyDescriptor(
                  Object.getPrototypeOf(el),
                  'value')?.set;
                if (nativeSetter) { nativeSetter.call(el, text); }
                else { el.value = text; }
                el.dispatchEvent(new InputEvent('input',  { bubbles: true, inputType: 'insertText', data: text }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
              return true;
            })()
          `)
          if (ok && fxEnabled) {
            const elId = /^@(\d+)$/.test(data.selector) ? data.selector.slice(1) : undefined
            await wc.executeJavaScript(
              `window.__nbFX && window.__nbFX.type(${JSON.stringify(data.text||'')}, ${elId !== undefined ? elId : 'undefined'})`
            ).catch(() => {})
          }
          res.end(JSON.stringify({ ok: !!ok, error: ok ? undefined : `Input not found: ${data.selector}` }))

        // ── Press key ───────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/press-key') {
          await ensureFX(wc)
          const key = data.key || 'Enter'
          if (fxEnabled) await wc.executeJavaScript(`window.__nbFX && window.__nbFX.pressKey(${JSON.stringify(key)})`).catch(()=>{})
          wc.sendInputEvent({ type: 'keyDown', keyCode: key })
          wc.sendInputEvent({ type: 'char',    keyCode: key })
          wc.sendInputEvent({ type: 'keyUp',   keyCode: key })
          res.end(JSON.stringify({ ok: true, key }))

        // ── Get text ────────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/get-text') {
          const text = await wc.executeJavaScript(`
            (function(){
              const sel = ${JSON.stringify(data.selector || 'body')};
              let el = null;
              // @N  →  element with data-nanobot-id
              if (/^@\\d+$/.test(sel)) {
                el = document.querySelector('[data-nanobot-id="'+sel.slice(1)+'"]');
              }
              // CSS selector
              if (!el) { try { el = document.querySelector(sel); } catch(e) {} }
              return el ? el.innerText : '';
            })()
          `)
          res.end(JSON.stringify({ text }))

        // ── Scroll ──────────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/scroll') {
          const dir = data.direction === 'up' ? -1 : 1
          await wc.executeJavaScript(`window.scrollBy(0, ${dir * (data.amount || 300)})`)
          res.end(JSON.stringify({ ok: true }))

        // ── Execute JS ──────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/execute') {
          const result = await wc.executeJavaScript(data.javascript || '')
          res.end(JSON.stringify({ result: String(result ?? '') }))

        // ── Screenshot ──────────────────────────────────────────────────
        } else if (req.method === 'GET' && req.url === '/screenshot') {
          const img = await wc.capturePage()
          const b64 = img.toJPEG(85).toString('base64')
          res.end(JSON.stringify({ image: b64, width: img.getSize().width, height: img.getSize().height }))

        // ── Page content ────────────────────────────────────────────────
        } else if (req.method === 'GET' && req.url === '/page-content') {
          const content = await wc.executeJavaScript(`
            (function() {
              const remove = ['script','style','noscript','iframe','nav','footer',
                'header','aside','[role="banner"]','[role="navigation"]',
                '.ad','.ads','.advertisement','.cookie-banner','.popup'];
              const clone = document.cloneNode(true);
              remove.forEach(sel => { try { clone.querySelectorAll(sel).forEach(el => el.remove()) } catch(_){} });
              const main = clone.querySelector('main,[role="main"],article,.article,.post,.content,.entry')
                        || clone.querySelector('.main-content,#main-content,#content,.page-content')
                        || clone.body;
              return {
                title: document.title, url: location.href,
                text: (main ? main.innerText : document.body.innerText).replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,20000)
              };
            })()
          `)
          res.end(JSON.stringify(content))

        // ── Tab: list ───────────────────────────────────────────────────
        } else if (req.method === 'GET' && req.url === '/tabs') {
          const focused = BrowserWindow.getFocusedWindow() || mainWindow
          const rendererWcId = focused?.webContents?.id
          const state = rendererWcId ? tabStateByWindow.get(rendererWcId) : null
          const tabs = state?.tabs || []
          const activeId = state?.activeId || null
          res.end(JSON.stringify({
            tabs: tabs.map(t => ({
              id: t.id, title: t.title, url: t.url,
              isActive: t.id === activeId,
            }))
          }))

        // ── All tabs content ────────────────────────────────────────────
        } else if (req.method === 'GET' && req.url === '/tabs-content') {
          // Get content from all open tabs
          const focused = BrowserWindow.getFocusedWindow() || mainWindow
          const rendererWcId = focused?.webContents?.id
          const state = rendererWcId ? tabStateByWindow.get(rendererWcId) : null
          const tabs = state?.tabs || []
          const activeId = state?.activeId || null

          const tabsWithContent = []
          for (const tab of tabs) {
            if (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:')) {
              try {
                // Get webContents for this tab
                const tabWc = webContents.fromId(tab.id)
                if (tabWc && !tabWc.isDestroyed()) {
                  const content = await tabWc.executeJavaScript(`
                    (function() {
                      const remove = ['script','style','noscript','iframe','nav','footer',
                        'header','aside','[role="banner"]','[role="navigation"]',
                        '.ad','.ads','.advertisement','.cookie-banner','.popup'];
                      const clone = document.cloneNode(true);
                      remove.forEach(sel => { try { clone.querySelectorAll(sel).forEach(el => el.remove()) } catch(_){} });
                      const main = clone.querySelector('main,[role="main"],article,.article,.post,.content,.entry')
                                || clone.querySelector('.main-content,#main-content,#content,.page-content')
                                || clone.body;
                      return {
                        title: document.title,
                        url: location.href,
                        text: (main ? main.innerText : document.body.innerText).replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,8000)
                      };
                    })()
                  `)
                  tabsWithContent.push({
                    id: tab.id,
                    title: content.title || tab.title,
                    url: content.url || tab.url,
                    isActive: tab.id === activeId,
                    content: content.text
                  })
                } else {
                  tabsWithContent.push({
                    id: tab.id,
                    title: tab.title,
                    url: tab.url,
                    isActive: tab.id === activeId,
                    content: '[页面内容不可访问]'
                  })
                }
              } catch (err) {
                tabsWithContent.push({
                  id: tab.id,
                  title: tab.title,
                  url: tab.url,
                  isActive: tab.id === activeId,
                  content: `[无法获取内容: ${err.message}]`
                })
              }
            }
          }
          res.end(JSON.stringify({ tabs: tabsWithContent, total: tabsWithContent.length }))

        // ── Tab: new ────────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/new-tab') {
          const tabUrl = data.url || ''
          if (tabUrl && !isSafeHttpUrl(tabUrl)) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'invalid url' })); return
          }
          focusedOrMainShell()?.webContents?.send('cmd:newTab', tabUrl)
          res.end(JSON.stringify({ ok: true }))

        // ── Tab: close ──────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/close-tab') {
          focusedOrMainShell()?.webContents?.send('cmd:closeTab')
          res.end(JSON.stringify({ ok: true }))

        // ── Tab: switch ─────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/switch-tab') {
          focusedOrMainShell()?.webContents?.send('cmd:switchTab', data.tabId)
          res.end(JSON.stringify({ ok: true }))

        } else {
          res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }))
        }
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: String(err) }))
      }
    })
  })
  server.listen(BRIDGE_PORT, '127.0.0.1', () => console.log(`[bridge] :${BRIDGE_PORT}`))
}

// ─── WebSocket proxy (for packaged app:// origin) ──────────────────────────────

// Try to load ws module, fall back to null if not available
let WebSocket = null
try {
  WebSocket = require('ws')
  console.log('[ws:proxy] ws module loaded successfully')
} catch (e) {
  console.error('[ws:proxy] Failed to load ws module:', e)
}

const wsConnections = new Map() // sessionId -> { ws, listeners: Set<webContentsId> }
const wsRetryTimers = new Map() // sessionId -> { count, timer }

function connectWebSocket(sessionId) {
  if (!WebSocket) {
    console.error('[ws:proxy] WebSocket module not available')
    broadcastToAllRenderers('ws:status', { sessionId, status: 'error', error: 'WebSocket module not loaded' })
    return
  }

  // 如果已有连接且是 OPEN/CONNECTING 状态，跳过
  const existing = wsConnections.get(sessionId)
  if (existing && (existing.ws.readyState === 0 || existing.ws.readyState === 1)) {
    console.log('[ws:proxy] Already connected or connecting:', sessionId)
    return
  }

  // 清除旧连接记录
  wsConnections.delete(sessionId)

  const wsUrl = `ws://127.0.0.1:${BACKEND_PORT}/ws/${sessionId}`
  const retryInfo = wsRetryTimers.get(sessionId)
  const attempt = retryInfo ? retryInfo.count + 1 : 1
  console.log('[ws:proxy] Connecting to:', wsUrl, `(attempt ${attempt})`)

  try {
    const ws = new WebSocket(wsUrl)
    const conn = { ws, listeners: new Set() }
    wsConnections.set(sessionId, conn)

    ws.on('open', () => {
      console.log('[ws:proxy] Connected:', sessionId)
      wsRetryTimers.delete(sessionId) // 重置重试计数
      broadcastToAllRenderers('ws:status', { sessionId, status: 'connected' })
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        broadcastToAllRenderers('ws:message', { sessionId, data: msg })
      } catch (e) {
        console.error('[ws:proxy] Failed to parse message:', e)
      }
    })

    ws.on('close', (code, reason) => {
      console.log('[ws:proxy] Closed:', sessionId, code, reason.toString())
      wsConnections.delete(sessionId)
      broadcastToAllRenderers('ws:status', { sessionId, status: 'disconnected', code, reason: reason.toString() })

      // 1006 = 异常断开，自动重连（指数退避，最多 10 次）
      if (code === 1006) {
        const nextAttempt = attempt + 1
        if (nextAttempt <= 10) {
          const delay = Math.min(500 * Math.pow(1.5, attempt), 15000) // 指数退避，最多15s
          console.log(`[ws:proxy] Retry ${nextAttempt}/10 in ${Math.round(delay)}ms:`, sessionId)
          const timer = setTimeout(() => {
            wsRetryTimers.delete(sessionId)
            connectWebSocket(sessionId)
          }, delay)
          wsRetryTimers.set(sessionId, { count: nextAttempt, timer })
        } else {
          console.error('[ws:proxy] Max retries reached:', sessionId)
          wsRetryTimers.delete(sessionId)
        }
      }
    })

    ws.on('error', (err) => {
      console.error('[ws:proxy] Error:', sessionId, err.message)
      // error 事件后 close 事件也会触发，重连逻辑在 close 里处理
    })
  } catch (err) {
    console.error('[ws:proxy] Failed to create WebSocket:', err)
    broadcastToAllRenderers('ws:status', { sessionId, status: 'error', error: String(err) })
  }
}

function disconnectWebSocket(sessionId) {
  // 停止自动重连
  const retryInfo = wsRetryTimers.get(sessionId)
  if (retryInfo) {
    clearTimeout(retryInfo.timer)
    wsRetryTimers.delete(sessionId)
  }
  const conn = wsConnections.get(sessionId)
  if (conn) {
    conn.ws.close()
    wsConnections.delete(sessionId)
  }
}

function sendWebSocketMessage(sessionId, data) {
  const conn = wsConnections.get(sessionId)
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(data))
    return true
  }
  return false
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

function registerIpc() {
  // ── Window controls (frameless mode) ────────────────────────────────────────
  ipcMain.handle('window:minimize',     (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize() })
  ipcMain.handle('window:maximize',     (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle('window:close',        (e) => { BrowserWindow.fromWebContents(e.sender)?.close() })
  ipcMain.handle('window:isMaximized',  (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

  // Renderer notifies main which webview is active (by webContentsId)
  // Track it per renderer window to avoid detached windows overriding the main window.
  ipcMain.handle('webview:setActive', (e, id) => { activeWebContentsByWindow.set(e.sender.id, id) })

  // Renderer syncs tab state so bridge /tabs has fresh data
  ipcMain.handle('webview:updateState', (e, state) => {
    tabStateByWindow.set(e.sender.id, { tabs: state.tabs || [], activeId: state.activeId || null })
  })

  // Find in page (Ctrl+F)
  ipcMain.handle('webview:findInPage', (_e, text, options) => {
    const wc = getActiveWc()
    if (!wc) return { requestId: -1, matches: 0 }
    const requestId = wc.findInPage(text, options || { forward: true, findNext: false })
    return { requestId, matches: 0 } // matches will be updated via event
  })
  ipcMain.handle('webview:stopFindInPage', (_e, action) => {
    const wc = getActiveWc()
    if (!wc) return
    wc.stopFindInPage(action || 'clearSelection')
  })
  // Listen for found-in-page events from all webviews and forward to renderer
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      const onFoundInPage = (_event, result) => {
        // Forward to all windows (simplified) or track which window owns this webview
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('webview:foundInPage', result)
        })
      }
      const onBeforeInput = (event, input) => {
        // Ctrl/Cmd+F is consumed by the webview guest; forward find UI to the host window.
        if ((input.control || input.meta) && input.key.toLowerCase() === 'f') {
          event.preventDefault()
          const hostWin = BrowserWindow.fromWebContents(contents)
            || (contents.hostWebContents && BrowserWindow.fromWebContents(contents.hostWebContents))
          if (hostWin && !hostWin.isDestroyed()) hostWin.webContents.send('shortcut:find')
        }
      }
      contents.on('found-in-page', onFoundInPage)
      contents.on('before-input-event', onBeforeInput)
      contents.once('destroyed', () => {
        contents.removeListener('found-in-page', onFoundInPage)
        contents.removeListener('before-input-event', onBeforeInput)
      })
    }
  })

  // Ad blocking toggle
  ipcMain.handle('adblock:getEnabled', () => adBlockEnabled)
  ipcMain.handle('adblock:setEnabled', (_e, enabled) => {
    adBlockEnabled = !!enabled
    saveAppSettings()
  })

  // Agent FX (virtual cursor + animations) toggle
  ipcMain.handle('fx:getEnabled', () => fxEnabled)
  ipcMain.handle('fx:setEnabled', (_e, enabled) => {
    fxEnabled = !!enabled
    saveAppSettings()
  })

  // ── Cookie management ─────────────────────────────────────────────────────────
  // Returns cookies for a domain (or all cookies if no domain given)
  ipcMain.handle('cookies:get', async (_e, domain) => {
    const ses = electronSession.defaultSession
    try {
      if (domain) {
        return await ses.cookies.get({ domain })
      }
      // All cookies (may be large, limit to 500)
      return await ses.cookies.get({})
    } catch (e) {
      return []
    }
  })

  // Set a cookie (url is required by Electron cookies API)
  ipcMain.handle('cookies:set', async (_e, { url, name, value, domain, path = '/', secure = false, httpOnly = false, sameSite = 'lax', expirationDate }) => {
    const ses = electronSession.defaultSession
    try {
      await ses.cookies.set({ url, name, value, domain, path, secure, httpOnly, sameSite, expirationDate })
      await ses.cookies.flushStore()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // Remove a cookie by name and domain
  ipcMain.handle('cookies:remove', async (_e, { url, name }) => {
    const ses = electronSession.defaultSession
    try {
      await ses.cookies.remove(url, name)
      await ses.cookies.flushStore()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // Clear all cookies
  ipcMain.handle('cookies:clearAll', async () => {
    const ses = electronSession.defaultSession
    try {
      const cookies = await ses.cookies.get({})
      for (const c of cookies) {
        await ses.cookies.remove(`https://${c.domain}${c.path}`, c.name)
      }
      await ses.cookies.flushStore()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // Right-click context menu for webview content
  ipcMain.handle('context-menu:show', (e, p) => {
    const shell = BrowserWindow.fromWebContents(e.sender)
    const wc = getActiveWc()
    const template = []

    // Navigation (only for webview)
    if (wc) {
      template.push(
        { label: '返回',   enabled: wc.canGoBack(),    click: () => wc.goBack()    },
        { label: '前进',   enabled: wc.canGoForward(), click: () => wc.goForward() },
        { label: '重新加载', click: () => wc.reload() },
        { type: 'separator' },
      )
    }

    // Link actions
    if (p.linkURL && isSafeHttpUrl(p.linkURL)) {
      template.push(
        { label: '在新标签页中打开链接', click: () => shell?.webContents?.send('cmd:newTab', p.linkURL) },
        { label: '在当前标签页中打开',   click: () => wc?.loadURL(p.linkURL)  },
        { label: '复制链接地址',          click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' },
      )
    } else if (p.linkURL) {
      // Unsafe protocol: only allow copy
      template.push(
        { label: '复制链接地址', click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' },
      )
    }

    // Image actions
    if (p.srcURL && p.mediaType === 'image') {
      template.push(
        { label: '在新标签页中打开图片', click: () => shell?.webContents?.send('cmd:newTab', p.srcURL) },
        { label: '复制图片地址',          click: () => clipboard.writeText(p.srcURL) },
        { type: 'separator' },
      )
    }

    // Text selection
    if (p.selectionText) {
      const q = p.selectionText.trim().slice(0, 30)
      template.push(
        { label: '复制',                    role: 'copy' },
        { label: `搜索 "${q}${q.length < p.selectionText.trim().length ? '…' : ''}"`,
          click: () => shell?.webContents?.send('cmd:newTab',
            `https://www.google.com/search?q=${encodeURIComponent(p.selectionText.trim())}`) },
        { label: '问 UrchinAI',
          click: () => shell?.webContents?.send('cmd:askAI', p.selectionText.trim()) },
        { type: 'separator' },
      )
    }

    // Page actions
    if (wc) {
      template.push(
        { label: '全选',       role: 'selectAll' },
        { label: '复制页面地址', click: () => wc && clipboard.writeText(wc.getURL()) },
        { type: 'separator' },
        { label: '查看页面源码', click: () => wc && shell?.webContents?.send('cmd:newTab', `view-source:${wc.getURL()}`) },
        { label: '检查元素',   click: () => wc?.openDevTools() },
      )
    } else {
      // For blank page / NewTabPage
      template.push(
        { label: '全选', role: 'selectAll' },
        { type: 'separator' },
        { label: '检查元素', click: () => shell?.webContents?.openDevTools() },
      )
    }

    if (shell) Menu.buildFromTemplate(template).popup({ window: shell })
  })

  // Detach tab → open as new Electron window
  ipcMain.handle('tab:detach', (_e, url, sx, sy, theme) => {
    const win = new BrowserWindow({
      width: 1300, height: 860, minWidth: 900, minHeight: 600,
      x: Math.max(0, (sx || 100) - 30), y: Math.max(0, (sy || 100) - 15),
      title: 'UrchinAI',
      titleBarStyle: 'hidden',
      frame: false,
      transparent: true,
      borderRadius: 12,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        partition: NANOBOT_PARTITION,  // share session so localStorage is synced
        // Security: keep webSecurity enabled in all environments
      },
    })
    attachRendererShortcuts(win)
    const encoded = encodeURIComponent(url || '')
    const query   = `initialUrl=${encoded}&theme=${theme || 'dark'}`
    if (RENDERER_URL) {
      win.loadURL(`${RENDERER_URL}?${query}`)
    } else {
      win.loadURL(`app://./dist/index.html?${query}`)
    }
    win.webContents.once('did-finish-load', () => {
      if (backendHealthReady) win.webContents.send('backend:ready')
    })
    return true
  })

  // Sessions
  ipcMain.handle('session:save', (_e, name) => {
    const all = loadSessions()
    const focused = BrowserWindow.getFocusedWindow() || mainWindow
    const rendererWcId = focused?.webContents?.id
    const state = rendererWcId ? tabStateByWindow.get(rendererWcId) : null
    const tabs = state?.tabs || []
    const entry = {
      id: `sess-${Date.now()}`,
      name: name || `会话 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: Date.now(),
      tabs: tabs.filter(t => t.url && !t.url.startsWith('about:')).map(t => ({ url: t.url, title: t.title })),
    }
    all.push(entry); saveSessions(all); return entry
  })
  ipcMain.handle('session:getAll',    ()       => loadSessions())
  ipcMain.handle('session:delete',    (_e, id) => { saveSessions(loadSessions().filter(s => s.id !== id)); return { ok: true } })
  ipcMain.handle('session:restore',   (e, id) => {
    const sess = loadSessions().find(s => s.id === id)
    if (!sess) return { ok: false }
    BrowserWindow.fromWebContents(e.sender)?.webContents?.send('cmd:restoreSession', sess.tabs)
    return { ok: true, count: sess.tabs.length }
  })
  ipcMain.handle('session:new', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.webContents?.send('cmd:newSession')
    return { ok: true }
  })

  // Get content from all open tabs for AI analysis
  ipcMain.handle('tabs:getAllContent', async () => {
    const focused = BrowserWindow.getFocusedWindow() || mainWindow
    const rendererWcId = focused?.webContents?.id
    const state = rendererWcId ? tabStateByWindow.get(rendererWcId) : null
    const tabs = state?.tabs || []
    const activeId = state?.activeId || null

    const tabsWithContent = []
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:')) {
        try {
          const tabWc = webContents.fromId(tab.id)
          if (tabWc && !tabWc.isDestroyed()) {
            const content = await tabWc.executeJavaScript(`
              (function() {
                const remove = ['script','style','noscript','iframe','nav','footer',
                  'header','aside','[role="banner"]','[role="navigation"]',
                  '.ad','.ads','.advertisement','.cookie-banner','.popup'];
                const clone = document.cloneNode(true);
                remove.forEach(sel => { try { clone.querySelectorAll(sel).forEach(el => el.remove()) } catch(_){} });
                const main = clone.querySelector('main,[role="main"],article,.article,.post,.content,.entry')
                          || clone.querySelector('.main-content,#main-content,#content,.page-content')
                          || clone.body;
                return {
                  title: document.title,
                  url: location.href,
                  text: (main ? main.innerText : document.body.innerText).replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,8000)
                };
              })()
            `)
            tabsWithContent.push({
              id: tab.id,
              title: content.title || tab.title,
              url: content.url || tab.url,
              isActive: tab.id === activeId,
              content: content.text
            })
          } else {
            tabsWithContent.push({
              id: tab.id,
              title: tab.title,
              url: tab.url,
              isActive: tab.id === activeId,
              content: '[页面内容不可访问]'
            })
          }
        } catch (err) {
          tabsWithContent.push({
            id: tab.id,
            title: tab.title,
            url: tab.url,
            isActive: tab.id === activeId,
            content: `[无法获取内容: ${err.message}]`
          })
        }
      }
    }
    return { tabs: tabsWithContent, total: tabsWithContent.length }
  })

  ipcMain.handle('shell:openExternal', (_e, url) => {
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'mailto:') {
        throw new Error('disallowed protocol')
      }
    } catch {
      return Promise.reject(new Error('Invalid URL'))
    }
    return shell.openExternal(url)
  })

  // API proxy: renderer → main → backend (bypasses CORS from app:// origin)
  ipcMain.handle('api:request', async (_e, { method, path, body }) => {
    const url = `http://127.0.0.1:${BACKEND_PORT}${path}`
    console.log('[api:proxy]', method, path)
    try {
      const opts = {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
      if (body && (method === 'POST' || method === 'PUT')) opts.body = body
      const res = await net.fetch(url, opts)
      const text = await res.text()
      if (!res.ok) {
        console.error('[api:proxy] FAIL', path, res.status, text.slice(0, 200))
        throw new Error(`${res.status} ${res.statusText}: ${text}`)
      }
      return text ? JSON.parse(text) : null
    } catch (err) {
      console.error('[api:proxy] ERROR', path, err.message)
      throw err
    }
  })

  // WebSocket proxy: renderer → main → backend WebSocket
  ipcMain.handle('ws:connect', (_e, sessionId) => {
    console.log('[ws:ipc] Connect request:', sessionId)
    connectWebSocket(sessionId)
    return { ok: true }
  })
  ipcMain.handle('ws:disconnect', (_e, sessionId) => {
    console.log('[ws:ipc] Disconnect request:', sessionId)
    disconnectWebSocket(sessionId)
    return { ok: true }
  })
  ipcMain.handle('ws:send', (_e, sessionId, data) => {
    return { ok: sendWebSocketMessage(sessionId, data) }
  })
  // Renderer registers to receive WebSocket messages
  ipcMain.on('ws:listen', (e, sessionId) => {
    const conn = wsConnections.get(sessionId)
    if (conn) {
      conn.listeners.add(e.sender.id)
      // Auto-remove listener when the renderer webContents is destroyed
      const wc = e.sender
      const cleanup = () => { conn.listeners.delete(wc.id); wc.removeListener('destroyed', cleanup) }
      wc.once('destroyed', cleanup)
    }
  })

  // ── DOM Element Picker ────────────────────────────────────────────────────
  let domPickerMode = false
  const DOM_PICKER_SCRIPT = `
    (function() {
      // 如果已存在 picker 实例，直接启动
      if (window.__domPicker) {
        window.__domPicker.start();
        return;
      }

      const picker = {
        overlay: null,
        hoveredElement: null,
        pickedElements: [], // 存储所有选中的元素

        createOverlay() {
          const div = document.createElement('div');
          div.id = '__dom-picker-overlay';
          div.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:2147483647;cursor:crosshair;';
          document.body.appendChild(div);
          return div;
        },

        highlightElement(el) {
          // 清除之前的高亮
          if (this.hoveredElement && !this.pickedElements.includes(this.hoveredElement)) {
            this.hoveredElement.style.outline = '';
            this.hoveredElement.style.backgroundColor = '';
          }
          if (el && el !== document.body && !this.pickedElements.includes(el)) {
            this.hoveredElement = el;
            el.style.outline = '2px solid #63b3ed';
            el.style.backgroundColor = 'rgba(99,179,237,0.1)';
          }
        },

        addBadgeToElement(el, badgeNumber) {
          // 创建 badge
          const badge = document.createElement('div');
          badge.id = '__dom-picked-badge-' + badgeNumber;
          badge.textContent = '#' + badgeNumber;
          badge.style.cssText =
            'position:fixed;' +
            'background: linear-gradient(135deg, #63b3ed, #4299e1);' +
            'color: white;' +
            'font-size: 11px;' +
            'font-weight: bold;' +
            'padding: 2px 8px;' +
            'border-radius: 12px;' +
            'box-shadow: 0 2px 8px rgba(99,179,237,0.5);' +
            'z-index: 2147483647;' +
            'pointer-events: none;' +
            'font-family: monospace;';

          // 计算位置
          const rect = el.getBoundingClientRect();
          badge.style.left = (rect.right - 20) + 'px';
          badge.style.top = (rect.top - 8) + 'px';

          document.body.appendChild(badge);
          this.pickedElements.push(el);

          // 给元素添加持久的蓝色边框
          el.style.outline = '2px solid #63b3ed';
          el.style.backgroundColor = 'rgba(99,179,237,0.08)';
          el.style.position = 'relative';
        },

        removeBadge() {
          // 清除所有 badge（用于重新选取时）
          this.pickedElements.forEach((el, idx) => {
            const badge = document.getElementById('__dom-picked-badge-' + (idx + 1));
            if (badge) badge.remove();
            el.style.outline = '';
            el.style.backgroundColor = '';
          });
          this.pickedElements = [];
        },

        removeBadgeByNumber(badgeNumber) {
          // 移除指定编号的 badge
          const index = badgeNumber - 1;
          if (index < 0 || index >= this.pickedElements.length) return;

          const el = this.pickedElements[index];
          const badge = document.getElementById('__dom-picked-badge-' + badgeNumber);
          if (badge) badge.remove();

          // 移除元素的样式
          el.style.outline = '';
          el.style.backgroundColor = '';

          // 从数组中移除
          this.pickedElements.splice(index, 1);

          // 重新编号剩余的 badges（只重排被删除位置之后的）
          this.pickedElements.forEach((el, idx) => {
            if (idx < index) return;
            const oldBadge = document.getElementById('__dom-picked-badge-' + (idx + 2));
            if (oldBadge) {
              oldBadge.id = '__dom-picked-badge-' + (idx + 1);
              oldBadge.textContent = '#' + (idx + 1);
            }
          });
        },

        getSelector(el) {
          if (!el || el === document.body) return 'body';

          // 优先尝试简单的唯一选择器
          // 1. 如果有 ID，直接使用（最稳定）
          if (el.id) {
            return '#' + el.id;
          }

          // 2. 尝试 tag + class 组合
          const tagName = el.tagName.toLowerCase();
          if (el.className) {
            const classes = el.className.toString().split(/\\s+/).filter(c => c && !c.startsWith('__dom') && !c.startsWith('data-nanobot'));
            // 使用第一个有意义的 class
            const meaningfulClass = classes.find(c => c.length > 2);
            if (meaningfulClass) {
              const selector = tagName + '.' + meaningfulClass;
              // 检查是否唯一
              if (document.querySelectorAll(selector).length === 1) {
                return selector;
              }
            }
          }

          // 3. 生成简化路径选择器（不使用 :nth-of-type，避免不稳定）
          const path = [];
          let current = el;
          let depth = 0;
          const maxDepth = 3; // 限制深度，避免过长选择器

          while (current && current !== document.body && depth < maxDepth) {
            let selector = current.tagName.toLowerCase();

            if (current.id) {
              selector = '#' + current.id;
              path.unshift(selector);
              break;
            }

            // 只使用第一个有意义的 class
            if (current.className) {
              const classes = current.className.toString().split(/\\s+/).filter(c => c && !c.startsWith('__dom') && !c.startsWith('data-nanobot') && c.length > 2);
              if (classes.length > 0) {
                selector += '.' + classes[0];
              }
            }

            path.unshift(selector);
            current = current.parentElement;
            depth++;
          }

          return path.join(' > ');
        },

        getElementInfo(el) {
          if (!el) return null;
          const rect = el.getBoundingClientRect();

          // 分配唯一的 data-nanobot-id（使用时间戳+随机数确保唯一）
          let nanobotId = el.getAttribute('data-nanobot-id');
          if (!nanobotId) {
            nanobotId = String(Math.floor(Math.random() * 1000000));
            el.setAttribute('data-nanobot-id', nanobotId);
          }

          return {
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className || null,
            selector: '@' + nanobotId,  // 使用 @N 格式，与后端兼容
            nanobotId: nanobotId,
            text: (el.textContent || '').trim().slice(0, 100),
            html: el.outerHTML.slice(0, 300),
            attributes: Array.from(el.attributes).reduce((acc, attr) => {
              if (!attr.name.startsWith('__dom')) acc[attr.name] = attr.value;
              return acc;
            }, {}),
            boundingRect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          };
        },

        handleMouseOver(e) {
          e.stopPropagation();
          e.preventDefault();
          this.highlightElement(e.target);
        },

        handleClick(e) {
          e.stopPropagation();
          e.preventDefault();
          e.stopImmediatePropagation();

          const info = this.getElementInfo(e.target);

          // 添加 badge 到选中的元素（角标编号为当前已选数量 + 1）
          const badgeNumber = this.pickedElements.length + 1;
          this.addBadgeToElement(e.target, badgeNumber);

          // Send result via custom event that Electron can capture
          window.__domPickerResult = info;
          window.postMessage({ type: '__DOM_PICKER_RESULT', data: info }, window.location.origin);

          // 自动停止选取模式（一次性），但不销毁实例以保留已选元素状态
          setTimeout(() => {
            this.stop();
          }, 100);

          return false;
        },

        handleContextMenu(e) {
          e.stopPropagation();
          e.preventDefault();
          e.stopImmediatePropagation();

          // 右键退出选取模式
          window.postMessage({ type: '__DOM_PICKER_CANCELLED' }, window.location.origin);
          this.stop();

          return false;
        },

        start() {
          // 如果已经存在 picker 实例，只重新创建 overlay 和事件监听
          // 保留已选中的元素和 badges
          this.overlay = this.createOverlay();
          document.body.style.cursor = 'crosshair';

          this._mouseover = this.handleMouseOver.bind(this);
          this._click = this.handleClick.bind(this);
          this._contextmenu = this.handleContextMenu.bind(this);
          this._mousedown = (e) => { e.stopPropagation(); e.preventDefault(); };
          this._mouseup = (e) => { e.stopPropagation(); e.preventDefault(); };

          document.addEventListener('mouseover', this._mouseover, true);
          document.addEventListener('click', this._click, true);
          document.addEventListener('contextmenu', this._contextmenu, true);
          document.addEventListener('mousedown', this._mousedown, true);
          document.addEventListener('mouseup', this._mouseup, true);
        },

        stop() {
          if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
          }
          document.body.style.cursor = '';

          // 清除悬停高亮（只要不是已选中的元素）
          if (this.hoveredElement && !this.pickedElements.includes(this.hoveredElement)) {
            this.hoveredElement.style.outline = '';
            this.hoveredElement.style.backgroundColor = '';
          }

          document.removeEventListener('mouseover', this._mouseover, true);
          document.removeEventListener('click', this._click, true);
          document.removeEventListener('contextmenu', this._contextmenu, true);
          document.removeEventListener('mousedown', this._mousedown, true);
          document.removeEventListener('mouseup', this._mouseup, true);
        }
      };

      window.__domPicker = picker;
      picker.start();
    })()
  `

  // Store picker result listeners (module level to prevent GC)
  let domPickerConsoleListener = null
  let domPickerTargetWc = null

  ipcMain.handle('domPicker:start', async () => {
    const wc = getActiveWc()
    if (!wc) return { ok: false, error: 'no active webview' }

    // Clean up previous listeners
    if (domPickerConsoleListener && domPickerTargetWc) {
      domPickerTargetWc.removeListener('console-message', domPickerConsoleListener)
    }

    domPickerMode = true
    domPickerTargetWc = wc

    // Inject picker script
    try {
      await wc.executeJavaScript(DOM_PICKER_SCRIPT)
    } catch (err) {
      console.error('[domPicker] Inject failed:', err)
      domPickerMode = false
      return { ok: false, error: String(err) }
    }

    // Listen for console messages (picker uses postMessage which appears as console in webview)
    domPickerConsoleListener = (e, level, message, line, sourceId) => {
      if (!domPickerMode) return
      try {
        const msg = message.toString()
        if (msg.includes('__DOM_PICKER_RESULT')) {
          const match = msg.match(/__DOM_PICKER_RESULT(.+)/)
          if (match) {
            const data = JSON.parse(match[1])
            domPickerMode = false
            wc.removeListener('console-message', domPickerConsoleListener)
            browserWindowForPageContents(wc)?.webContents?.send('domPicker:picked', data)
          }
        } else if (msg.includes('__DOM_PICKER_CANCELLED')) {
          domPickerMode = false
          wc.removeListener('console-message', domPickerConsoleListener)
          browserWindowForPageContents(wc)?.webContents?.send('domPicker:picked', null)
        }
      } catch (_) {}
    }

    wc.on('console-message', domPickerConsoleListener)

    // Also inject a listener for postMessage
    await wc.executeJavaScript(`
      (function() {
        if (window.__domPickerMessageListener) return;
        window.__domPickerMessageListener = function(e) {
          if (e.data && e.data.type === '__DOM_PICKER_RESULT') {
            console.log('__DOM_PICKER_RESULT' + JSON.stringify(e.data.data));
          } else if (e.data && e.data.type === '__DOM_PICKER_CANCELLED') {
            console.log('__DOM_PICKER_CANCELLED');
          }
        };
        window.addEventListener('message', window.__domPickerMessageListener);
      })()
    `).catch(() => {})

    return { ok: true }
  })

  ipcMain.handle('domPicker:stop', async () => {
    const wc = getActiveWc()

    domPickerMode = false

    // Clean up console listener
    if (domPickerConsoleListener && domPickerTargetWc) {
      domPickerTargetWc.removeListener('console-message', domPickerConsoleListener)
      domPickerConsoleListener = null
    }
    domPickerTargetWc = null

    if (wc) {
      await wc.executeJavaScript(`
        (function() {
          if (window.__domPicker) {
            window.__domPicker.stop();
            window.__domPicker = null;
          }
          if (window.__domPickerMessageListener) {
            window.removeEventListener('message', window.__domPickerMessageListener);
            window.__domPickerMessageListener = null;
          }
        })()
      `).catch(() => {})
    }

    return { ok: true }
  })

  // 移除特定 badge
  ipcMain.handle('domPicker:removeBadge', async (_e, badgeNumber) => {
    const wc = getActiveWc()
    if (!wc) return { ok: false, error: 'no active webview' }

    await wc.executeJavaScript(`
      (function() {
        if (window.__domPicker) {
          window.__domPicker.removeBadgeByNumber(${JSON.stringify(badgeNumber)});
        }
      })()
    `).catch(() => {})

    return { ok: true }
  })

  // 清除所有 badges
  ipcMain.handle('domPicker:clearAllBadges', async () => {
    const wc = getActiveWc()
    if (!wc) return { ok: false, error: 'no active webview' }

    await wc.executeJavaScript(`
      (function() {
        if (window.__domPicker) {
          window.__domPicker.removeBadge();
        }
      })()
    `).catch(() => {})

    return { ok: true }
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

/** Ctrl/Cmd+F and DevTools shortcuts on the shell (renderer) webContents. */
function attachRendererShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'f') {
      event.preventDefault()
      win.webContents.send('shortcut:find')
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (isDev || !isDev) {
        win.webContents.toggleDevTools()
      }
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: 'UrchinAI',
    titleBarStyle: 'hidden',
    frame: false,
    transparent: true,
    borderRadius: 12,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: NANOBOT_PARTITION,
      // Security: keep webSecurity enabled in all environments
    },
  })

  if (RENDERER_URL) {
    mainWindow.loadURL(RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL('app://./dist/index.html')
  }

  mainWindow.on('closed', () => { mainWindow = null })

  attachRendererShortcuts(mainWindow)
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

// Security: keep sandbox enabled. Do not use no-sandbox unless absolutely
// necessary for a specific platform bug, and then only as a last resort.

// Crash handling
process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[main] Unhandled Rejection:', reason)
})

// Fix black screen / crash issues
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

// Linux crash fix - use software rendering
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('disable-in-process-stack-traces')
  // Fix /dev/shm permission issues
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  // Keep sandbox enabled: do not use no-zygote or disable-setuid-sandbox
  // unless running in a container that lacks namespace sandbox support.
}

// Intercept new-window requests from ALL webviews → open as new tab instead of popup
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (!isSafeHttpUrl(url)) return { action: 'deny' }
      const win = browserWindowForPageContents(contents) || mainWindow
      win?.webContents?.send('cmd:newTab', url)
      return { action: 'deny' }
    })

    // Auto-cleanup nanobot highlight labels on navigation (page-agent pattern)
    const cleanup = () => {
      contents.executeJavaScript(`
        document.querySelectorAll('[data-nanobot-id]').forEach(el => el.removeAttribute('data-nanobot-id'));
        if (window.__nbFX && window.__nbFX.clearHL) window.__nbFX.clearHL();
        if (window.__nbFX && window.__nbFX.clearLabels) window.__nbFX.clearLabels();
      `).catch(() => {})
    }
    contents.on('did-navigate', cleanup)
    contents.on('did-navigate-in-page', cleanup)
  }
})

/** Poll GET /api/health until backend is ready, then resolve. */
function waitForBackend(maxWaitMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now()
    function poll() {
      http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) { resolve(true); return }
        retry()
      }).on('error', retry)
    }
    function retry() {
      if (Date.now() - start > maxWaitMs) { resolve(false); return }
      setTimeout(poll, 400)
    }
    poll()
  })
}

app.whenReady().then(async () => {
  // Register app:// protocol for packaged mode (serves dist/ from app root)
  // Must register on NANOBOT_PARTITION session since main window uses that partition
  if (!isDev) {
    const appRoot = path.join(__dirname, '..')
    const handler = (request) => {
      const pathname = new URL(request.url).pathname.replace(/^\//, '')
      const filePath = path.resolve(appRoot, pathname)
      const relative = path.relative(appRoot, filePath)
      if (relative.startsWith('..')) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(filePath).toString())
    }
    protocol.handle('app', handler)
    electronSession.fromPartition(NANOBOT_PARTITION).protocol.handle('app', handler)
  }

  Menu.setApplicationMenu(null)  // 去掉菜单栏
  loadAppSettings()
  // Apply ad blocking to both the default session and our named partition
  setupAdBlocking(electronSession.defaultSession)
  setupAdBlocking(electronSession.fromPartition(NANOBOT_PARTITION))

  // Configure CORS and network settings for the session
  const configureSession = (sess) => {
    // Only inject CSP for our local app:// protocol; do not weaken CSP for external sites.
    sess.webRequest.onHeadersReceived((details, callback) => {
      if (!details.url.startsWith('app://')) {
        callback({ responseHeaders: details.responseHeaders })
        return
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';",
            "connect-src 'self' ws: wss: http: https:;",
            "script-src 'self' 'unsafe-inline';",
            "style-src 'self' 'unsafe-inline';",
            "img-src 'self' data: blob: https: http:;",
            "font-src 'self' data:;"
          ].join(' ')
        }
      })
    })
  }
  configureSession(electronSession.defaultSession)
  configureSession(electronSession.fromPartition(NANOBOT_PARTITION))

  registerIpc()
  startBridgeServer()
  startBackend()
  // Show the window immediately so the user sees the loading screen,
  // but wait until the backend is healthy before the renderer is told it's ready.
  createWindow()
  let backendReady = false
  let pageLoaded = false
  const maybeSendBackendReady = () => {
    if (!backendReady || !pageLoaded) return
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('backend:ready')
    }
  }
  mainWindow?.webContents?.on('did-finish-load', () => {
    pageLoaded = true
    maybeSendBackendReady()
  })
  const ok = await waitForBackend()
  backendReady = true
  backendHealthReady = true
  console.log(`[main] backend ready: ${ok}`)
  maybeSendBackendReady()
})

app.on('window-all-closed', () => { stopBackend(); if (process.platform !== 'darwin') app.quit() })
app.on('activate',          () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('before-quit',       stopBackend)
