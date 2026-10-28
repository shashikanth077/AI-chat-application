import { useEffect, useState } from 'react';
import { getInfo } from '../services/infoService';
import type { Info } from '../types/info';

/** Deployment facts (model, provider, limits). Null until loaded, and stays null if the server can't say. */
export function useInfo(): Info | null {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    let cancelled = false;
    getInfo()
      .then((value) => !cancelled && setInfo(value))
      .catch(() => {
        /* the header simply shows no model chip */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}
