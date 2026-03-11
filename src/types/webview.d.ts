// TypeScript declaration for Electron's <webview> HTML tag.
// Extending React.HTMLAttributes ensures React's key, ref, style etc. all work.

interface WebviewHTMLAttributes extends React.HTMLAttributes<HTMLElement> {
  key?: React.Key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref?: React.Ref<any>
  src?: string
  allowpopups?: string
  partition?: string
  nodeintegration?: string
  nodeintegrationinsubframes?: string
  plugins?: string
  preload?: string
  httpreferrer?: string
  useragent?: string
  disablewebsecurity?: string
  webpreferences?: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        webview: WebviewHTMLAttributes
      }
    }
  }

  /** Electron webview DOM element — typed as any for simplicity */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type WebviewElement = any
}

export {}
