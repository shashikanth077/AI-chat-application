import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'theme';

const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

// localStorage can throw (private mode, blocked storage); the theme still works without it.
function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Light/dark theme. Follows the operating system until the user picks one,
 * then remembers the choice. The CSS reads `data-theme` on <html>; index.html
 * sets it before the first paint so there is no flash of the wrong theme.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme());
  const [chosen, setChosen] = useState(() => stored() !== null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (chosen) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [chosen]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setChosen(true);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };

  return { theme, toggle };
}
