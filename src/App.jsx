import { useEffect, useState } from 'react'
import CheapestClog from './cheapest/CheapestClog.jsx'
import CollectionPlanner from './collection/CollectionPlanner.jsx'
import ImportPanel from './components/ImportPanel.jsx'
import Enhancing from './enhancing/Enhancing.jsx'
import { useProfile } from './profile/useProfile.js'
import XpCalculator from './xp/XpCalculator.jsx'
import './App.css'

const TABS = [
  { id: 'import', label: 'Import', Tool: ImportPanel },
  { id: 'xp', label: 'XP calculator', Tool: XpCalculator },
  { id: 'collection', label: 'Clog Planner', Tool: CollectionPlanner },
  { id: 'cheapest-clog', label: 'Cheapest Clog', Tool: CheapestClog },
  { id: 'enhancing', label: 'Enhancing', Tool: Enhancing },
]

// Current tab comes from the URL hash (#xp, #collection, #cheapest-clog, #enhancing, #import) so each tool can be linked directly
function useHashTab() {
  const read = () => TABS.find((t) => `#${t.id}` === window.location.hash) ?? TABS[0]
  const [tab, setTab] = useState(read)
  useEffect(() => {
    const onHash = () => setTab(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return tab
}

function App() {
  const { profile, setProfile, mergeImport } = useProfile()
  const { id, Tool } = useHashTab()

  return (
    <main>
      <h1>Careless Tools</h1>
      <h2>Pls keep within the guild, FYI TIME IS STILL WIP (movement isn't calculated)</h2>
      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={t.id === id ? 'active' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>

      <Tool profile={profile} setProfile={setProfile} mergeImport={mergeImport} />
    </main>
  )
}

export default App
