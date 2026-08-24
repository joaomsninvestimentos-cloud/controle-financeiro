/**
 * Agentation uses `isActive` internally to control "feedback mode" (collapsed widget vs. clickable page annotations).
 * The npm package does not expose a controlled prop, so we drive equivalent behavior via the library's built-in DOM / keyboard interactions.
 *
 * When the parent window sends commands via iframe `postMessage`, the origin must match `parentOrigin` in the current page URL (same origin as PREVIEW_COPY),
 * to prevent arbitrary pages from impersonating the parent window to control feedback mode.
 */

/**
 * Consistent with `postPreviewCopy` in `AgentationGuard`: reads the parent window origin from `?parentOrigin=`.
 * Defaults to `*` when not provided, consistent with existing preview behavior (accepts any origin, for local debugging only).
 */
export function getParentOriginFromLocation(): string {
  if (typeof window === 'undefined') return '*'
  return new URLSearchParams(window.location.search).get('parentOrigin') ?? '*'
}

export const AGENTATION_FEEDBACK_EVENT_NAME = 'agentation_feedback_mode'

function isOriginAllowed(eventOrigin: string, configured: string): boolean {
  if (configured === '*') return true
  return eventOrigin === configured
}

/**
 * Enable: programmatically click the collapsed toolbar (`title="Start feedback mode"`).
 * Disable: dispatch `Escape` when expanded (consistent with the toolbar's "Exit"; may close an open annotation popover first, requiring a second press).
 */
export function setAgentationFeedbackMode(enabled: boolean) {
  if (typeof document === 'undefined') return

  const toolbar = document.querySelector('[data-feedback-toolbar]')
  if (!toolbar) return

  const startEl = toolbar.querySelector<HTMLElement>(
    '[title="Start feedback mode"]'
  )
  const isCollapsed = startEl != null

  if (enabled) {
    if (isCollapsed) startEl.click()
    return
  }

  if (!isCollapsed) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    )
  }
}

/**
 * Handle feedback mode commands from the parent window. Only executes when `event.origin` matches the configured `parentOrigin`.
 * Payload: `{ event_name: 'agentation_feedback_mode', enable: boolean }`.
 */
export function tryHandleAgentationFeedbackMessage(
  event: MessageEvent,
  parentOrigin: string = getParentOriginFromLocation()
): boolean {
  if (!isOriginAllowed(event.origin, parentOrigin)) return false

  const d = event.data
  if (!d || typeof d !== 'object') return false
  const msg = d as Record<string, unknown>
  if (msg.event_name !== AGENTATION_FEEDBACK_EVENT_NAME) return false
  if (typeof msg.enable !== 'boolean') return false

  setAgentationFeedbackMode(msg.enable)
  return true
}

/**
 * Subscribe to `window` `message` events, validate against the current URL's `parentOrigin`, and apply feedback mode.
 */
export function subscribeAgentationFeedbackFromParent(
  getConfiguredOrigin: () => string = getParentOriginFromLocation
): () => void {
  if (typeof window === 'undefined') return () => {}

  const onMessage = (e: MessageEvent) => {
    tryHandleAgentationFeedbackMessage(e, getConfiguredOrigin())
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
