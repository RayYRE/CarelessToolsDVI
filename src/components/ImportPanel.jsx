import { useState } from 'react'
import { parseExport, parseStats } from '../import/parse.js'

// One paste box: runs `parse` on the text and hands the result to onImport
function ImportBox({ title, hint, placeholder, parse, fallbackError, onImport }) {
  const [text, setText] = useState('')
  const [message, setMessage] = useState(null)

  const runImport = () => {
    const { settings, found, error } = parse(text)
    if (!found.length) {
      setMessage({ warn: true, text: error ?? fallbackError })
      return
    }
    onImport(settings)
    setMessage({ warn: false, text: `Imported ${found.join(', ')}.` })
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
        <span>XP gain / rare-find</span>
        <strong>
          {profile.xpGain}% / {profile.rareFind}%
        </strong>
      </div>
      <div className="stat">
        <span>Luck / speed</span>
        <strong>
          {luck || '—'} / {speed || '—'} skills
        </strong>
      </div>
      <p className="hint">Saved in this browser and used by every tab.</p>
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
          hint="Copy your Stat page starting from Offence. Sets XP gain, luck, rare-find and speeds."
          placeholder={`Offence
Combat style
Combat level
Max hit
...`}
          parse={parseStats}
          fallbackError='No stats recognised — paste the "Your bonuses" section.'
          onImport={mergeImport}
        />
      </div>
    </>
  )
}
