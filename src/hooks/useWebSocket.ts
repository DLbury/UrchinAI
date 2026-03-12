import { useCallback, useEffect, useRef, useState } from 'react'
import type { WSMessage } from '../types'

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

const RETRY_DELAY_MS  = 2000   // base retry interval
const MAX_RETRY_DELAY = 15000  // cap exponential backoff at 15 s

export function useWebSocket(sessionId: string) {
  const wsRef          = useRef<WebSocket | null>(null)
  const retryTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay     = useRef(RETRY_DELAY_MS)
  const destroyed      = useRef(false)
  const [status, setStatus] = useState<Status>('disconnected')
  const onMessageRef   = useRef<((msg: WSMessage) => void) | null>(null)

  const scheduleRetry = useCallback(() => {
    if (destroyed.current) return
    retryTimer.current = setTimeout(() => {
      retryDelay.current = Math.min(retryDelay.current * 1.5, MAX_RETRY_DELAY)
      connect() // eslint-disable-line @typescript-eslint/no-use-before-define
    }, retryDelay.current)
  }, []) // connect defined below, captured via closure after hoisting

  const connect = useCallback(() => {
    if (destroyed.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return

    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }

    // In Electron production (file://), use fixed backend address
    // In development, use window.location.host (for dev server proxy)
    const isDev = window.location.hostname === 'localhost' && window.location.port === '5174'
    const host = isDev ? window.location.host : '127.0.0.1:8001'
    const ws = new WebSocket(`ws://${host}/ws/${sessionId}`)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      retryDelay.current = RETRY_DELAY_MS // reset backoff on success
      setStatus('connected')
    }

    ws.onclose = () => {
      setStatus('disconnected')
      scheduleRetry()
    }

    ws.onerror = () => {
      setStatus('error')
      // onclose fires right after onerror, retry handled there
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage
        onMessageRef.current?.(msg)
      } catch {
        // ignore malformed frames
      }
    }
  }, [sessionId, scheduleRetry])

  useEffect(() => {
    destroyed.current = false
    connect()
    return () => {
      destroyed.current = true
      if (retryTimer.current) clearTimeout(retryTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const onMessage = useCallback((handler: (msg: WSMessage) => void) => {
    onMessageRef.current = handler
  }, [])

  return { send, onMessage, status, reconnect: connect }
}
