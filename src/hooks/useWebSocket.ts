import { useCallback, useEffect, useRef, useState } from 'react'
import type { WSMessage } from '../types'

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

const RETRY_DELAY_MS  = 2000
const MAX_RETRY_DELAY = 15000

export function useWebSocket(sessionId: string) {
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelayRef = useRef(RETRY_DELAY_MS)
  const destroyedRef = useRef(false)
  const [status, setStatus] = useState<Status>('disconnected')
  const onMessageRef = useRef<((msg: WSMessage) => void) | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const connectingRef = useRef(false)

  const connect = useCallback(() => {
    if (destroyedRef.current || connectingRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

    connectingRef.current = true
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    setStatus('connecting')

    // Always use direct WebSocket connection to backend
    // In dev mode, Vite proxies /ws to backend
    // In production, connect directly to 127.0.0.1:8001
    const host = import.meta.env.DEV ? window.location.host : '127.0.0.1:8001'
    const wsUrl = `ws://${host}/ws/${sessionId}`
    console.log('[ws] Connecting to:', wsUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[ws] Connected')
        connectingRef.current = false
        retryDelayRef.current = RETRY_DELAY_MS
        setStatus('connected')
      }

      ws.onclose = (e) => {
        console.log('[ws] Disconnected:', e.code, e.reason)
        connectingRef.current = false
        setStatus('disconnected')
        if (!destroyedRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, MAX_RETRY_DELAY)
            connect()
          }, retryDelayRef.current)
        }
      }

      ws.onerror = (e) => {
        console.error('[ws] Error:', e)
        connectingRef.current = false
        setStatus('error')
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WSMessage
          onMessageRef.current?.(msg)
        } catch {
          // ignore malformed frames
        }
      }
    } catch (err) {
      console.error('[ws] Failed to create WebSocket:', err)
      connectingRef.current = false
      setStatus('error')
      retryTimerRef.current = setTimeout(() => {
        retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, MAX_RETRY_DELAY)
        connect()
      }, retryDelayRef.current)
    }
  }, [sessionId])

  useEffect(() => {
    console.log('[ws] useEffect init, sessionId:', sessionId)
    destroyedRef.current = false
    connectingRef.current = false
    connect()

    return () => {
      console.log('[ws] Cleanup for sessionId:', sessionId)
      destroyedRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [sessionId, connect])

  const sendQueueRef = useRef<string[]>([])

  const drainQueue = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && sendQueueRef.current.length > 0) {
      const batch = sendQueueRef.current.splice(0, sendQueueRef.current.length)
      batch.forEach(jsonStr => wsRef.current?.send(jsonStr))
    }
  }, [])

  const send = useCallback((data: unknown) => {
    const jsonStr = JSON.stringify(data)
    console.log('[ws] sending:', jsonStr.substring(0, 200) + (jsonStr.length > 200 ? '...' : ''))
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(jsonStr)
    } else if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      sendQueueRef.current.push(jsonStr)
    } else {
      console.error('[ws] Cannot send, connection not open')
      throw new Error('WebSocket not open')
    }
  }, [])

  useEffect(() => {
    drainQueue()
  }, [status, drainQueue])

  const onMessage = useCallback((handler: (msg: WSMessage) => void) => {
    onMessageRef.current = handler
  }, [])

  const reconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    connectingRef.current = false
    connect()
  }, [connect])

  return { send, onMessage, status, reconnect }
}