// "Keep me signed in" -> localStorage (survives closing the browser); otherwise sessionStorage
const KEYS = ['accessToken', 'refreshToken'];

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const tokenStorage = {
  get: (key) => safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key)),
  set(tokens, remember) {
    const target = remember ? localStorage : sessionStorage;
    this.clear();
    safe(() => KEYS.forEach((k) => tokens[k] && target.setItem(k, tokens[k])));
  },
  // Used by token refresh: keep the token in whichever storage already holds the session
  updateAccess(token) {
    const target = safe(() => (localStorage.getItem('refreshToken') ? localStorage : sessionStorage));
    safe(() => target.setItem('accessToken', token));
  },
  clear: () => safe(() => KEYS.forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); })),
};

export default tokenStorage;
