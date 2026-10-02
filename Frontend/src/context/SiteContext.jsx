import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const SiteContext = createContext({ loading: false, comingSoon: false, launchDate: null });

// Asks the server whether Coming Soon mode is on (COMING_SOON in the backend .env)
export function SiteProvider({ children }) {
  const [state, setState] = useState({ loading: true, comingSoon: false, launchDate: null });

  useEffect(() => {
    let cancelled = false;
    api
      .get('/site')
      .then((res) => !cancelled && setState({ loading: false, ...res.data.data }))
      // If the check fails the app loads normally; the API still refuses members while the mode is on
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false })));
    // The API client fires this when a request is refused because the site isn't open yet
    const close = () => setState((s) => ({ ...s, loading: false, comingSoon: true }));
    window.addEventListener('site:coming-soon', close);
    return () => {
      cancelled = true;
      window.removeEventListener('site:coming-soon', close);
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
