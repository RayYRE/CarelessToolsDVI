// Reads the snapshot saved by the "Deep Vein Idle · Character import" userscript.
// The script only answers on the sites in its @match list (localhost, 127.0.0.1, dvi-lab.pages.dev)
// plus any "User matches" added in Tampermonkey.
export function readCharacterSnapshot(timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const id = `careless-${Date.now()}-${Math.random()}`
    const cleanup = () => {
      clearTimeout(timer)
      document.removeEventListener('dvi-character-response', onReply)
    }
    const onReply = (event) => {
      let reply
      try {
        reply = JSON.parse(event.detail)
      } catch {
        return
      }
      if (reply?.source !== 'dvi-character-script' || reply.id !== id) return
      cleanup()
      if (reply.error) reject(new Error(reply.error))
      else if (!reply.snapshot) reject(new Error('Nothing captured yet. Open the game with the userscript on, then try again.'))
      else resolve(reply.snapshot)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('No reply from the userscript. Is it installed and enabled for this site?'))
    }, timeoutMs)
    document.addEventListener('dvi-character-response', onReply)
    document.dispatchEvent(
      new CustomEvent('dvi-character-request', {
        // The script ignores requests whose source isn't exactly "dvi-simulator"
        detail: JSON.stringify({ source: 'dvi-simulator', action: 'read', id }),
      }),
    )
  })
}
