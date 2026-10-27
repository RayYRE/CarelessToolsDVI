// Reads the snapshot saved by a character userscript: CarelessToolsImport, Careless Tools · Profit
// or the dvi-lab "Character import". Each only answers on the sites in its @match list (plus any
// "User matches" added in Tampermonkey).

// Once the first script answers, how long to wait for others (several may be installed)
const MORE_REPLIES_MS = 300

// Newest capture wins when several scripts answer
const capturedAt = (snapshot) => Math.max(snapshot.capturedAt ?? 0, snapshot.stats?.capturedAt ?? 0)

export function readCharacterSnapshot(timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const id = `careless-${Date.now()}-${Math.random()}`
    const replies = []
    let settleTimer = null

    const finish = () => {
      clearTimeout(timer)
      clearTimeout(settleTimer)
      document.removeEventListener('dvi-character-response', onReply)
      const snapshots = replies.filter((r) => r.snapshot).map((r) => r.snapshot)
      if (snapshots.length) {
        resolve(snapshots.reduce((best, s) => (capturedAt(s) > capturedAt(best) ? s : best)))
      } else if (replies.some((r) => r.error)) {
        reject(new Error(replies.find((r) => r.error).error))
      } else if (replies.length) {
        reject(new Error('Nothing captured yet. Open the game with the userscript on, then try again.'))
      } else {
        reject(new Error('No reply from the userscript. Is it installed and enabled for this site?'))
      }
    }

    const onReply = (event) => {
      let reply
      try {
        reply = JSON.parse(event.detail)
      } catch {
        return
      }
      if (reply?.source !== 'dvi-character-script' || reply.id !== id) return
      replies.push(reply)
      settleTimer ??= setTimeout(finish, MORE_REPLIES_MS)
    }

    const timer = setTimeout(finish, timeoutMs)
    document.addEventListener('dvi-character-response', onReply)
    document.dispatchEvent(
      new CustomEvent('dvi-character-request', {
        // The scripts ignore requests whose source isn't exactly "dvi-simulator"
        detail: JSON.stringify({ source: 'dvi-simulator', action: 'read', id }),
      }),
    )
  })
}
