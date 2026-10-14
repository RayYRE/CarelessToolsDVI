import { useState } from 'react'
import { SKILL_GROUPS } from '../game/jobs.js'
import { parseExport, parseStats } from '../import/parse.js'
import { xpSourceScope } from '../game/xpSources.js'
import { skillXpGain } from '../profile/xpGain.js'

// One paste box: runs `parse` on the text and hands the result to onImport
function ImportBox({ title, hint, placeholder, parse, fallbackError, onImport }) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState(null)

  const runImport = () => {
    const { settings, found, error, warning } = parse(text)
    if (!found.length) {
      setMessage({ warn: true, text: error ?? fallbackError })
      return
    }
    onImport(settings)
    setMessage({ warn: false, text: `Imported ${found.join(', ')}.`, warning })
    setText('')
  }

  return (
    <div className="panel import-box">
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={runImport} disabled={!text.trim()}>
        Import
      </button>
      {message && <p className={message.warn ? 'warn' : 'hint'}>{message.text}</p>}
      {message?.warning && <p className="warn">{message.warning}</p>}
    </div>
  )
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
          Sources add up to {sum}%, but the total is {profile.xpGain}%. Check the paste.
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
      <div className="import-grid">
        <ImportBox
          title="Character export (JSON)"
          hint="Settings -> Privacy -> Export my character. Sets skill XP and collection log."
          placeholder={`{
  "game": "Deep Vein Idle",
  "skills": { ... }
}`}
          parse={parseExport}
          fallbackError="No skills found in this export."
          onImport={mergeImport}
        />
        <ImportBox
          title="Stats export"
          hint="Copy your Stat page starting from Your bonuses. With XP gain sources showed"
          placeholder={`Your bonuses click for sources
XP gain
+71%
Home (combat)
+15%
Gatherer's brew
+10%
...`}
          parse={parseStats}
          fallbackError='No stats recognised — paste the "Your bonuses" section.'
          onImport={mergeImport}
        />
      </div>
      <XpGainSources profile={profile} />
    </>
  )
}
