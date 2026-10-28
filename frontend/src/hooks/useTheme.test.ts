import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTheme } from './useTheme';

function mockSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
  return { change: (nowDark: boolean) => { query.matches = nowDark; listeners.forEach((fn) => fn()); } };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => localStorage.clear());

describe('useTheme', () => {
  it('starts from the system preference and applies it to <html>', () => {
    mockSystemTheme(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('prefers a saved choice over the system', () => {
    mockSystemTheme(true);
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('toggle flips the theme, updates <html>, and remembers the choice', () => {
    mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('follows the system while the user has not chosen, but stops once they do', () => {
    const system = mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());
    act(() => system.change(true));
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggle()); // user picks light
    act(() => system.change(true)); // system flips again: ignored now
    expect(result.current.theme).toBe('light');
  });

  it('survives storage that throws (private mode)', () => {
    mockSystemTheme(false);
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
