/**
 * Direct calls to the Electron HTTP bridge (localhost:8002).
 * Used for read-only page operations that don't need the Python backend.
 */

const BRIDGE = 'http://localhost:8002'

async function bridgeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BRIDGE}${path}`)
  if (!res.ok) throw new Error(`Bridge ${path} failed: ${res.status}`)
  return res.json()
}

export interface PageContent {
  title: string
  url: string
  text: string
}

export async function getPageContent(): Promise<PageContent> {
  return bridgeGet<PageContent>('/page-content')
}

export interface Screenshot {
  image: string   // base64 JPEG
  width: number
  height: number
}

export async function takeScreenshot(): Promise<Screenshot> {
  return bridgeGet<Screenshot>('/screenshot')
}
