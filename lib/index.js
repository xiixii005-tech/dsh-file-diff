/**
 * File Diff Timeline — node half (placeholder)
 * =============================================
 * The browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration. This node half exists so the loader
 * entry resolves; the plugin is purely a client-side UI contribution and
 * needs no host logic, so apply is a no-op.
 */

/** No host services are required. */
export const inject = []

/**
 * No-op host half; all functionality lives in the browser client half.
 * @param _ctx - host context.
 */
export function apply(_ctx) {
  // Intentional no-op: this package contributes browser UI only.
}
