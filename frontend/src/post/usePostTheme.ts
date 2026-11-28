import { useLayoutEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../shared/storage-keys';

export type PostTheme = 'light' | 'dark';

function readInitialTheme(): PostTheme {
  try {
    return localStorage.getItem(STORAGE_KEYS.POST_THEME) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function usePostTheme() {
  const switchingRef = useRef(false);
  const [theme, setTheme] = useState<PostTheme>(readInitialTheme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!switchingRef.current) {
      root.dataset.theme = theme;
      return;
    }
    switchingRef.current = false;
    root.dataset.themeSwitching = '';
    root.dataset.theme = theme;
    void root.offsetHeight;
    delete root.dataset.themeSwitching;
  }, [theme]);

  function toggleTheme() {
    const next: PostTheme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEYS.POST_THEME, next);
    } catch {}
    switchingRef.current = true;
    setTheme(next);
  }

  return { theme, toggleTheme };
}
