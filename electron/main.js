'use strict'

const { app, BrowserWindow, ipcMain, shell, session: electronSession, webContents, Menu, clipboard } = require('electron')
const path   = require('path')
const http   = require('http')
const fs     = require('fs')
const os     = require('os')
const { spawn, execSync } = require('child_process')

const isDev        = !app.isPackaged
const RENDERER_URL = isDev ? 'http://localhost:5174' : null
const BACKEND_PORT = 8001
const BRIDGE_PORT  = 8002

let mainWindow  = null
let backendProc = null
let adBlockEnabled = true

// Active webview's webContentsId (set by renderer whenever tab changes)
let activeWebContentsId = null

// ─── Nanobot Agent FX (injected into webviews) ────────────────────────────────

let fxEnabled = true   // toggled from SettingsModal

const NANOBOT_FX_SCRIPT = `
(function() {
  if (window.__nbFX) return; // already injected this page-load

  /* ── Inject styles ── */
  const S = document.createElement('style');
  S.textContent = \`
    #__nb-wrap { position:fixed; top:0; left:0; width:0; height:0; pointer-events:none; z-index:2147483647; }

    /* ── SVG arrow cursor ── */
    #__nb-cur {
      position: fixed; display: none; pointer-events: none;
      z-index: 2147483647;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45)) drop-shadow(0 0 8px rgba(99,179,237,0.7));
      transition: left 0.28s cubic-bezier(.4,0,.2,1), top 0.28s cubic-bezier(.4,0,.2,1);
      transform-origin: 3px 3px;
    }
    #__nb-cur.nb-click {
      animation: __nb-cur-click 0.35s ease-out forwards;
    }
    @keyframes __nb-cur-click {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.35) rotate(-12deg); }
      60%  { transform: scale(0.92) rotate(5deg); }
      100% { transform: scale(1) rotate(0deg); }
    }

    /* ── Click ripple ring ── */
    .nb-ripple {
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2.5px solid rgba(99,179,237,0.85);
      border-radius: 50%;
      animation: __nb-ripple-anim 0.55s ease-out forwards;
    }
    @keyframes __nb-ripple-anim {
      0%   { width:6px; height:6px; margin:-3px 0 0 -3px; opacity:1; }
      100% { width:56px; height:56px; margin:-28px 0 0 -28px; opacity:0; }
    }

    /* ── Element highlights ── */
    .__nb-hl {
      outline: 2.5px solid #63b3ed !important; outline-offset: 3px !important;
      background-color: rgba(99,179,237,0.10) !important;
      border-radius: 4px !important; transition: all 0.12s ease !important;
    }
    .__nb-hl-type {
      outline: 2.5px solid #68d391 !important; outline-offset: 3px !important;
      background-color: rgba(104,211,145,0.09) !important;
      border-radius: 4px !important; transition: all 0.12s ease !important;
    }

    /* ── Numbered labels ── */
    .__nb-lbl {
      position: absolute !important; pointer-events: none !important;
      background: rgba(59,130,246,0.93); color: #fff;
      font: 700 10px/1.5 monospace; padding: 0 5px; border-radius: 4px;
      z-index: 2147483645; box-shadow: 0 1px 5px rgba(0,0,0,0.4);
      animation: __nb-lbl-in 0.14s ease;
    }
    @keyframes __nb-lbl-in { from { opacity:0; transform:scale(.6); } to { opacity:1; transform:scale(1); } }

    /* ── Scan flash ── */
    .__nb-scan {
      animation: __nb-scan-anim 0.55s ease-out forwards !important;
    }
    @keyframes __nb-scan-anim {
      0%   { outline: 1px solid rgba(99,179,237,.8) !important; background-color: rgba(99,179,237,.18) !important; }
      100% { outline: 1px solid rgba(99,179,237,0)  !important; background-color: transparent !important; }
    }

    /* ── Action toast ── */
    #__nb-toast {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      background: rgba(8,12,28,0.90); color: #e2e8f0;
      padding: 8px 20px; border-radius: 999px;
      font: 600 13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;
      z-index: 2147483644; pointer-events: none;
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(99,179,237,0.28);
      box-shadow: 0 4px 28px rgba(0,0,0,0.45);
      white-space: nowrap; max-width: 440px; overflow: hidden; text-overflow: ellipsis;
      opacity: 0; transition: opacity 0.16s ease;
    }
    #__nb-toast.nb-show { opacity: 1; }
  \`;
  (document.head || document.documentElement).appendChild(S);

  /* ── Build persistent cursor SVG ── */
  const cur = document.createElement('div');
  cur.id = '__nb-cur';
  cur.innerHTML = \`<svg width="26" height="32" viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2 L3 26 L9 19.5 L13.5 29 L17 27.5 L12.5 18 L20 18 Z"
      fill="white" stroke="#1e3a5f" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M3 2 L3 26 L9 19.5 L13.5 29 L17 27.5 L12.5 18 L20 18 Z"
      fill="url(#nbGrad)" stroke="none" opacity="0.55"/>
    <defs>
      <linearGradient id="nbGrad" x1="3" y1="2" x2="20" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#93c5fd"/>
        <stop offset="100%" stop-color="#3b82f6"/>
      </linearGradient>
    </defs>
  </svg>\`;
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

// Tab state cache (updated by renderer, consumed by bridge /list-tabs)
let tabStateCache = []
let activeTabIdCache = null

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

  // Check if backend directory exists
  if (!fs.existsSync(backendDir)) {
    console.error('[backend] Backend directory not found:', backendDir)
    return
  }

  const python = process.platform === 'win32' ? 'python' : 'python3'
  try {
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${BACKEND_PORT}"') do taskkill /f /pid %a`, { stdio: 'ignore' })
    } else {
      execSync(`fuser -k ${BACKEND_PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore' })
    }
  } catch (_) {}

  // Hide console window on Windows production build
  const spawnOpts = {
    cwd: backendDir,
    stdio: isDev ? 'inherit' : 'ignore',
    windowsHide: true,
    detached: false,
  }

  console.log('[backend] Starting Python backend from:', backendDir)
  backendProc = spawn(python,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
    spawnOpts)

  backendProc.on('error', (err) => console.error('[backend] Failed to start:', err))
  backendProc.on('exit', (c) => console.log('[backend] exit', c))
}

function stopBackend() {
  backendProc?.kill(); backendProc = null
}

// ─── HTTP bridge (Python → webview control) ──────────────────────────────────

function getActiveWc() {
  if (!activeWebContentsId) return null
  try { return webContents.fromId(activeWebContentsId) } catch (_) { return null }
}

function startBridgeServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')

    // Tab-management endpoints don't need an active wc
    const noWcNeeded = ['/tabs', '/new-tab', '/close-tab', '/switch-tab']
    const wc = getActiveWc()

    if (!wc && !noWcNeeded.includes(req.url)) {
      res.writeHead(503); res.end(JSON.stringify({ error: 'no active webview' })); return
    }

    let body = ''
    req.on('data', d => { body += d })
    req.on('end', async () => {
      let data = {}
      try { data = JSON.parse(body || '{}') } catch (_) {}

      try {
        // ── Navigation ──────────────────────────────────────────────────
        if (req.method === 'POST' && req.url === '/navigate') {
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
              // Stamp each visible interactive element with a stable numeric ID
              document.querySelectorAll('[data-nanobot-id]').forEach(el => el.removeAttribute('data-nanobot-id'));
              const SEL = [
                'a[href]:not([href=""])',
                'button:not([disabled])',
                'input:not([type="hidden"]):not([disabled])',
                'select:not([disabled])',
                'textarea:not([disabled])',
                '[role="button"]:not([disabled])',
                '[role="link"]','[role="checkbox"]','[role="radio"]',
                '[role="menuitem"]','[role="tab"]','[role="option"]',
                '[contenteditable="true"]',
              ].join(',');
              const vw = window.innerWidth, vh = window.innerHeight;
              const descs = [];
              document.querySelectorAll(SEL).forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width<=0||r.height<=0) return;
                if (r.bottom<0||r.top>vh||r.right<0||r.left>vw) return;
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
                descs.push(d);
              });
              // Also extract main text content
              const clone = document.body.cloneNode(true);
              clone.querySelectorAll('script,style,noscript,nav,footer,header,[aria-hidden="true"]')
                .forEach(e=>e.remove());
              const bodyText = (clone.innerText||'').replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,3000);
              return { title: document.title, url: location.href, elementCount: descs.length, elements: descs, bodyText };
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
              return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2),
                       tag: el.tagName, text: (el.textContent||'').trim().slice(0,60) };
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
              el.focus();
              if (el.isContentEditable) {
                el.innerText = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              } else {
                const nativeSetter = Object.getOwnPropertyDescriptor(
                  el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
                  'value')?.set;
                if (nativeSetter) { nativeSetter.call(el, text); }
                else { el.value = text; }
                el.dispatchEvent(new Event('input',  { bubbles: true }));
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
              const el = document.querySelector(sel);
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
          res.end(JSON.stringify({
            tabs: tabStateCache.map(t => ({
              id: t.id, title: t.title, url: t.url,
              isActive: t.id === activeTabIdCache,
            }))
          }))

        // ── Tab: new ────────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/new-tab') {
          mainWindow?.webContents?.send('cmd:newTab', data.url || '')
          res.end(JSON.stringify({ ok: true }))

        // ── Tab: close ──────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/close-tab') {
          mainWindow?.webContents?.send('cmd:closeTab')
          res.end(JSON.stringify({ ok: true }))

        // ── Tab: switch ─────────────────────────────────────────────────
        } else if (req.method === 'POST' && req.url === '/switch-tab') {
          mainWindow?.webContents?.send('cmd:switchTab', data.tabId)
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

// ─── IPC ─────────────────────────────────────────────────────────────────────

function registerIpc() {
  // Renderer notifies main which webview is active (by webContentsId)
  ipcMain.handle('webview:setActive', (_e, id) => { activeWebContentsId = id })

  // Renderer syncs tab state so bridge /list-tabs has fresh data
  ipcMain.handle('webview:updateState', (_e, state) => {
    tabStateCache   = state.tabs   || []
    activeTabIdCache = state.activeId || null
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

  // Right-click context menu for webview content
  ipcMain.handle('context-menu:show', (_e, p) => {
    const wc = getActiveWc()
    const template = []

    // Navigation
    if (wc) {
      template.push(
        { label: '返回',   enabled: wc.canGoBack(),    click: () => wc.goBack()    },
        { label: '前进',   enabled: wc.canGoForward(), click: () => wc.goForward() },
        { label: '重新加载', click: () => wc.reload() },
        { type: 'separator' },
      )
    }

    // Link actions
    if (p.linkURL) {
      template.push(
        { label: '在新标签页中打开链接', click: () => mainWindow?.webContents?.send('cmd:newTab', p.linkURL) },
        { label: '在当前标签页中打开',   click: () => wc?.loadURL(p.linkURL)  },
        { label: '复制链接地址',          click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' },
      )
    }

    // Image actions
    if (p.srcURL && p.mediaType === 'image') {
      template.push(
        { label: '在新标签页中打开图片', click: () => mainWindow?.webContents?.send('cmd:newTab', p.srcURL) },
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
          click: () => mainWindow?.webContents?.send('cmd:newTab',
            `https://www.google.com/search?q=${encodeURIComponent(p.selectionText.trim())}`) },
        { type: 'separator' },
      )
    }

    // Page actions
    template.push(
      { label: '全选',       role: 'selectAll' },
      { label: '复制页面地址', click: () => wc && clipboard.writeText(wc.getURL()) },
      { type: 'separator' },
      { label: '查看页面源码', click: () => wc && mainWindow?.webContents?.send('cmd:newTab', `view-source:${wc.getURL()}`) },
      { label: '检查元素',   click: () => wc?.openDevTools() },
    )

    Menu.buildFromTemplate(template).popup({ window: mainWindow })
  })

  // Detach tab → open as new Electron window
  ipcMain.handle('tab:detach', (_e, url, sx, sy, theme) => {
    const t = theme || 'dark'
    const bgColor = t === 'light' ? '#f2f4f7' : '#111827'
    const win = new BrowserWindow({
      width: 1300, height: 860, minWidth: 900, minHeight: 600,
      x: Math.max(0, (sx || 100) - 30), y: Math.max(0, (sy || 100) - 15),
      title: 'UrchinAI 浏览器',
      titleBarStyle: 'hiddenInset',
      backgroundColor: bgColor,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        partition: NANOBOT_PARTITION,  // share session so localStorage is synced
      },
    })
    const encoded = encodeURIComponent(url || '')
    const query   = `initialUrl=${encoded}&theme=${t}`
    if (RENDERER_URL) {
      win.loadURL(`${RENDERER_URL}?${query}`)
    } else {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { initialUrl: url || '', theme: t } })
    }
    return true
  })

  // Sessions
  ipcMain.handle('session:save', (_e, name) => {
    const all = loadSessions()
    const entry = {
      id: `sess-${Date.now()}`,
      name: name || `会话 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: Date.now(),
      tabs: tabStateCache.filter(t => t.url && !t.url.startsWith('about:')).map(t => ({ url: t.url, title: t.title })),
    }
    all.push(entry); saveSessions(all); return entry
  })
  ipcMain.handle('session:getAll',    ()       => loadSessions())
  ipcMain.handle('session:delete',    (_e, id) => { saveSessions(loadSessions().filter(s => s.id !== id)); return { ok: true } })
  ipcMain.handle('session:restore',   (_e, id) => {
    const sess = loadSessions().find(s => s.id === id)
    if (!sess) return { ok: false }
    mainWindow?.webContents?.send('cmd:restoreSession', sess.tabs)
    return { ok: true, count: sess.tabs.length }
  })

  ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url))
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: 'UrchinAI 浏览器',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: NANOBOT_PARTITION,  // shared session for ad blocking
    },
  })

  if (RENDERER_URL) {
    mainWindow.loadURL(RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.commandLine.appendSwitch('no-sandbox')
// Fix black screen issues - only disable GPU on Windows
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

// Intercept new-window requests from ALL webviews → open as new tab instead of popup
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      // Forward to renderer so it can create a new tab
      mainWindow?.webContents?.send('cmd:newTab', url)
      return { action: 'deny' }
    })
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

const NANOBOT_PARTITION = 'persist:urchin'

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)  // 去掉菜单栏
  loadAppSettings()
  // Apply ad blocking to both the default session and our named partition
  setupAdBlocking(electronSession.defaultSession)
  setupAdBlocking(electronSession.fromPartition(NANOBOT_PARTITION))
  registerIpc()
  startBridgeServer()
  startBackend()
  // Show the window immediately so the user sees the loading screen,
  // but wait until the backend is healthy before the renderer is told it's ready.
  createWindow()
  const ok = await waitForBackend()
  console.log(`[main] backend ready: ${ok}`)
  // Notify renderer so it can retry WS / API calls right away
  mainWindow?.webContents?.send('backend:ready')
})

app.on('window-all-closed', () => { stopBackend(); if (process.platform !== 'darwin') app.quit() })
app.on('activate',          () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('before-quit',       stopBackend)
