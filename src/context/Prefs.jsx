import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_PREFS, applyTheme, loadPrefs, savePref, setSoundEnabled } from '../utils/preferences.js';

const PrefsContext = createContext({ prefs: DEFAULT_PREFS, ready: false, setPref: async () => {}, reload: async () => {} });

/** Loads device-local preferences once and keeps theme + sound in sync. */
export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const loaded = await loadPrefs();
      setPrefs(loaded);
      applyTheme(loaded.dark);
      setSoundEnabled(loaded.sound);
    } catch {
      applyTheme(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setPref = useCallback(async (field, value) => {
    setPrefs(prev => ({ ...prev, [field]: value }));
    if (field === 'dark') applyTheme(value);
    if (field === 'sound') setSoundEnabled(value);
    await savePref(field, value);
  }, []);

  return <PrefsContext.Provider value={{ prefs, ready, setPref, reload }}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  return useContext(PrefsContext);
}
