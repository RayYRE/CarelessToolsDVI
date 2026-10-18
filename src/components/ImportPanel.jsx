import { useState } from 'react'
import { SKILL_GROUPS } from '../game/jobs.js'
import { parseSnapshot } from '../import/parse.js'
import { readCharacterSnapshot } from '../import/userscript.js'
import { xpSourceScope } from '../game/xpSources.js'
import { skillXpGain } from '../profile/xpGain.js'

// Served from public/. Tampermonkey offers to install any link ending in .user.js
const USERSCRIPT_URL = `${import.meta.env.BASE_URL}CarelessToolsImport.user.js`

// One-click import from the CarelessToolsImport userscript, the only way to fill the profile
function UserscriptImport({ onImport }) {
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const runImport = async () => {
    setBusy(true)
    try {
      const snapshot = await readCharacterSnapshot()
      const { settings, found, error, warning } = parseSnapshot(snapshot)
      if (!found.length) throw new Error(error)
      onImport(settings)
      const ages = [
        snapshot.capturedAt && `character ${timeAgo(snapshot.capturedAt)}`,
        snapshot.stats?.capturedAt && `stats ${timeAgo(snapshot.stats.capturedAt)}`,
      ].filter(Boolean)
      const age = ages.length ? ` Captured: ${ages.join(', ')}.` : ''
      // This app's userscript always sends `stats`, null until the in-game stats menu is opened
      const noStats =
        'stats' in snapshot && !snapshot.stats
          ? 'No bonuses captured yet. Open the stats menu in the game once, then import again.'
          : undefined
      setMessage({
        warn: false,
        text: `Imported ${found.join(', ')}.${age}`,
        warning: warning ?? noStats,
      })
    } catch (error) {
      setMessage({ warn: true, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel import-box">
      <h2>Import from the game</h2>
      <p className="hint">
        Needs the CarelessToolsImport userscript in Tampermonkey: with Tampermonkey installed,
        Download userscript opens its install page. Open the game with it on and
        wait for "stats captured" in the bottom-left corner, then import here. Sets skill XP,
        collection log, Rune lectern level, Enhancing mastery and your bonuses (XP gain,
        rare-find, luck, speed).
      </p>
      <div className="button-row">
        <button type="button" onClick={runImport} disabled={busy}>
          {busy ? 'Reading…' : 'Import from userscript'}
        </button>
        <a className="button" href={USERSCRIPT_URL} target="_blank" rel="noreferrer">
          Download userscript
        </a>
      </div>
      {message && <p className={message.warn ? 'warn' : 'hint'}>{message.text}</p>}
      {message?.warning && <p className="warn">{message.warning}</p>}
    </div>
  )
}

// "5 min ago" for a capture time in ms
function timeAgo(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

// What the profile currently holds, so players can see what's been imported
function SavedSummary({ profile }) {
  const skills = Object.keys(profile.skillXp).length
  const luck = Object.keys(profile.luck).length
  const speed = Object.keys(profile.speed).length
  const items = Object.keys(profile.collection).length
  return (
    <section className="panel result">
      <div className="stat">
        <span>Skill XP</span>
        <strong>{skills ? `${skills} skills` : '—'}</strong>
      </div>
      <div className="stat">
        <span>Collection log</span>
        <strong>{items ? `${items} items` : '—'}</strong>
      </div>
      <div className="stat">
        <span>XP gain</span>
        <strong>{profile.xpGain}%</strong>
      </div>
      <div className="stat">
        <span>Rare-find</span>
        <strong>{profile.rareFind}%</strong>
      </div>
      <div className="stat">
        <span>Luck (gathering skills)</span>
        <strong>
          {luck} / {SKILL_GROUPS.Gathering.length}
        </strong>
      </div>
      <div className="stat">
        <span>Speed (skills)</span>
        <strong>
          {speed} / {SKILL_GROUPS.Gathering.length + SKILL_GROUPS.Processing.length}
        </strong>
      </div>
      <p className="hint">Saved in this browser and used by every tab.</p>
    </section>
  )
}

// Breakdown of the XP gain total, showing which skills each source boosts
function XpGainSources({ profile }) {
  const sources = profile.xpGainSources ?? []
  const sum = sources.reduce((total, src) => total + src.value, 0)
  return (
    <section className="panel">
      <h2>XP gain sources</h2>
      {sources.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>XP gain</th>
                <th>Applies to</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => (
                <tr key={src.label} className="static">
                  <td>{src.label}</td>
                  <td>+{src.value}%</td>
                  <td>{xpSourceScope(src.label).appliesTo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sources.length > 0 && sum !== profile.xpGain && (
        <p className="warn">
          Sources add up to {sum}%, but the total is {profile.xpGain}%. Import again from the game.
        </p>
      )}
      <div className="controls adjust-result">
        <div className="stat">
          <span>Stats screen total</span>
          <strong>{profile.xpGain}%</strong>
        </div>
        <div className="stat">
          <span>Gathering skills</span>
          <strong>{skillXpGain(profile, 'Mining')}%</strong>
        </div>
        <div className="stat">
          <span>Processing skills</span>
          <strong>{skillXpGain(profile, 'Smithing')}%</strong>
        </div>
      </div>
    </section>
  )
}

export default function ImportPanel({ profile, mergeImport }) {
  return (
    <>
      <SavedSummary profile={profile} />
      <UserscriptImport onImport={mergeImport} />
      <XpGainSources profile={profile} />
    </>
  )
}
