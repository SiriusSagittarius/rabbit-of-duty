// Anmeldung mit Google – nur für die Bestenliste. Fliegen geht ohne Konto.
//
// Das Google-Skript lädt erst, wenn jemand auf die Anmeldung zugeht (button()), nicht beim Öffnen des Spiels.
// Der Browser bekommt ein ID-Token (gültig etwa eine Stunde), das beim Eintragen an den Server geht; der prüft es
// (server/src/google-auth.ts) und speichert nur eine pseudonyme Kennung. In der Liste steht der Spielname.

export const GOOGLE_CLIENT_ID = '143254298181-cbbct92rpp5or3rktq3g6mjhdgsf71di.apps.googleusercontent.com';
const KEY = 'rod.gtoken';                  // sessionStorage: Token bis zum Schließen des Tabs

let gis = null, token = null, exp = 0, inited = false;
const listeners = new Set();

function payload(t) {
  try {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))));
  } catch { return null; }
}
function set(t) {
  const p = t && payload(t);
  token = p ? t : null; exp = p ? p.exp * 1000 : 0;
  if (token) sessionStorage.setItem(KEY, token); else sessionStorage.removeItem(KEY);
  for (const fn of listeners) fn(auth.signedIn);
}
set(sessionStorage.getItem(KEY));

function loadGis() {
  gis ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google-Anmeldung nicht verfügbar')));
    s.onerror = () => { gis = null; reject(new Error('Google nicht erreichbar')); };
    document.head.appendChild(s);
  });
  return gis;
}

export const auth = {
  /** Gültig angemeldet (mit einer Minute Puffer vor dem Ablauf). */
  get signedIn() { return !!token && Date.now() < exp - 60_000; },
  get token() { return auth.signedIn ? token : null; },
  /** Bei Änderung (an-/abgemeldet) benachrichtigen. */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Google-Knopf in el zeichnen; nach der Anmeldung wird onDone gerufen. Lädt dafür das Google-Skript. */
  async button(el, onDone) {
    el.textContent = 'Anmeldung wird geladen …';
    try {
      const id = await loadGis();
      if (!inited) {
        id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => { set(r.credential); auth._done?.(); }, auto_select: false, ux_mode: 'popup', itp_support: true });
        inited = true;
      }
      auth._done = onDone;
      el.textContent = '';
      id.renderButton(el, { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'de' });
    } catch (err) {
      el.textContent = 'Google-Anmeldung gerade nicht erreichbar.';
      console.warn('[auth]', err);
    }
  },
  signOut() {
    set(null);
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* egal */ }
  },
};
