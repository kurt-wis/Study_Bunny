import { useEffect } from 'react';
import { getSetting, setSetting } from '../db/database.js';
import { dayKey } from '../services/home/overview.js';

const TICK_SECONDS = 15;

async function addSeconds(seconds) {
  if (seconds <= 0) return;
  const key = dayKey(new Date());
  const log = (await getSetting('studyLog', {})) || {};
  await setSetting('studyLog', { ...log, [key]: (log[key] ?? 0) + seconds });
}

/**
 * Counts focused study time while a quiz or review screen is open and visible,
 * and adds it to the device-local `studyLog` ({ 'YYYY-MM-DD': seconds }).
 */
export default function useStudyTimer(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    let pending = 0;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') pending += TICK_SECONDS;
      if (pending >= 60) {
        const chunk = pending;
        pending = 0;
        addSeconds(chunk).catch(() => {});
      }
    }, TICK_SECONDS * 1000);
    return () => {
      clearInterval(timer);
      addSeconds(pending).catch(() => {});
    };
  }, [active]);
}
