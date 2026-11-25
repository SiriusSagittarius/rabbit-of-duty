// Google-Anmeldung prüfen (für die Bestenliste): Der Browser schickt das ID-Token, das „Mit Google anmelden“ liefert.
// Geprüft werden Signatur (RS256 mit Googles öffentlichen Schlüsseln), Empfänger (unsere Client-ID), Aussteller
// und Ablaufzeit. Ohne Zusatzpakete: Node lädt die Schlüssel als JWK und prüft mit crypto.verify.
//
// Gespeichert wird vom Konto nur eine pseudonyme Kennung (uid = Hash aus Googles „sub“), kein Name, keine E-Mail.
import * as crypto from 'crypto';

/** OAuth-Client „Flying Much Web“ (öffentlich, steht auch im Seitencode). Mit GOOGLE_CLIENT_ID überschreibbar. */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '143254298181-cbbct92rpp5or3rktq3g6mjhdgsf71di.apps.googleusercontent.com';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const SALT = process.env.HS_SALT || 'flying-much';

type Jwk = crypto.JsonWebKey & { kid?: string };
type CertSource = () => Promise<{ keys: Jwk[]; maxAge: number }>;

let source: CertSource = async () => {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error(`Google-Schlüssel: HTTP ${r.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1]) || 3600;
  const j = (await r.json()) as { keys: Jwk[] };
  return { keys: j.keys || [], maxAge };
};
const keys = new Map<string, crypto.KeyObject>();
let until = 0, lastTry = 0, loading: Promise<void> | null = null;

async function refresh() {
  loading ||= (async () => {
    lastTry = Date.now();
    const { keys: list, maxAge } = await source();
    keys.clear();
    for (const k of list) if (k.kid) keys.set(k.kid, crypto.createPublicKey({ key: k, format: 'jwk' }));
    until = Date.now() + Math.min(maxAge, 24 * 3600) * 1000;
  })().finally(() => { loading = null; });
  return loading;
}
async function keyFor(kid: string) {
  // Neu laden, wenn abgelaufen; bei unbekannter Kennung höchstens einmal pro Minute (Google tauscht Schlüssel aus)
  if (Date.now() > until || (!keys.has(kid) && Date.now() - lastTry > 60_000)) await refresh();
  return keys.get(kid);
}

/** Nur für Tests: andere Schlüsselquelle setzen. */
export function _setCertSource(fn: CertSource) { source = fn; keys.clear(); until = 0; lastTry = 0; }

const part = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** Prüft ein Google-ID-Token. Gibt die pseudonyme Kennung zurück oder wirft einen Fehler. */
export async function verifyGoogleIdToken(token: string): Promise<{ uid: string }> {
  const p = String(token || '').split('.');
  if (p.length !== 3 || token.length > 4096) throw new Error('kein Token');
  const head = part(p[0]), body = part(p[1]);
  if (head.alg !== 'RS256' || typeof head.kid !== 'string') throw new Error('falsches Verfahren');
  const key = await keyFor(head.kid);
  if (!key) throw new Error('unbekannter Schlüssel');
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${p[0]}.${p[1]}`), key, Buffer.from(p[2], 'base64url'))) throw new Error('Signatur');
  if (body.aud !== GOOGLE_CLIENT_ID) throw new Error('falscher Empfänger');
  if (!ISSUERS.has(body.iss)) throw new Error('falscher Aussteller');
  if (!(Number(body.exp) * 1000 > Date.now() - 60_000)) throw new Error('abgelaufen');
  if (!body.sub) throw new Error('ohne Konto');
  return { uid: crypto.createHash('sha256').update(SALT + ':' + body.sub).digest('base64url').slice(0, 22) };
}
