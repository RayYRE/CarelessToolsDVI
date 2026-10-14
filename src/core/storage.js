import { useCallback, useEffect, useState } from 'react'

export function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

// useState that is saved to localStorage under `key`. `fallback` supplies
// initial values when nothing is saved yet (e.g. migrating an old key).
export function usePersistentState(key, defaults, fallback) {
  const [state, setState] = useState(() => ({
    ...defaults,
    ...(readStorage(key) ?? fallback?.() ?? {}),
  }))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // storage unavailable; state just won't persist
    }
  }, [key, state])

  const update = useCallback((patch) => setState((s) => ({ ...s, ...patch })), [])
  return [state, update, setState]
}
