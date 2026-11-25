// Wunschliste: Vorschläge für Flying Much, Knopf „💡 Wunschliste“ im Startmenü und in der Pause.
//
// Die Einträge stehen in wunschliste.json (vom Entwickler gepflegt, wird bei jedem Öffnen frisch geladen):
//   { email, items: [{ id, titel, text, von, status: 'offen' | 'arbeit' | 'erledigt', datum, fertig }] }
// Oben: Mail-Knopf, Adresse zum Kopieren, Regeln fürs Einsenden. Der Knopf klappt eine Auswahl auf: Mail-Programm
// (mailto), Gmail, Outlook/Hotmail im Browser oder Vorlage kopieren. Viele PCs haben kein Mail-Programm eingerichtet,
// dann tut ein reiner mailto-Link nichts (oder öffnet nur ein leeres Fenster).
// Darunter „Geplant“ (offen / in Arbeit) und „Erledigt“ (abgehakt) mit dem Namen dessen, der es vorgeschlagen hat.

const URL_LIST = './wunschliste.json';
const FALLBACK_MAIL = 'flyingmuch@hapaluv.de';

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const SUBJECT = 'Flying Much – Vorschlag';
const BODY = [
  'Mein Spielname (steht dann beim Vorschlag in der Liste):', '', '',
  'Mein Vorschlag:', '', '', '',
  'Material im Anhang (Fotos, Töne, Musik, 3D-Modelle):', '',
  'Selbst gemacht? Oder woher stammt es (Quelle und Lizenz)?', '', '',
].join('\n');
const q = encodeURIComponent;
const WAYS = {
  app: (m) => `mailto:${m}?subject=${q(SUBJECT)}&body=${q(BODY)}`,
  gmail: (m) => `https://mail.google.com/mail/?view=cm&fs=1&to=${q(m)}&su=${q(SUBJECT)}&body=${q(BODY)}`,
  outlook: (m) => `https://outlook.live.com/mail/0/deeplink/compose?to=${q(m)}&subject=${q(SUBJECT)}&body=${q(BODY)}`,
};

export function createWishlist() {
  const root = el('div', 'ovp');
  root.id = 'wish';
  root.innerHTML = `
    <div class="g-box" role="dialog" aria-label="Wunschliste">
      <div class="g-head"><b>💡 WUNSCHLISTE</b><span class="g-flex"></span><button type="button" class="g-close">◀ Zurück</button></div>
      <div class="g-body">
        <p class="g-goal">Das sind die Wünsche für Flying Much. Gute Vorschläge kommen mit dem Namen des Einsenders in die
          Liste, und was fertig ist, wird abgehakt.</p>
        <div class="w-send">
          <a class="btn primary w-mail" href="#" aria-expanded="false">✉️ Vorschlag oder Material schicken</a>
          <div class="w-addr"><span class="w-email"></span><button type="button" class="w-copy">Adresse kopieren</button></div>
        </div>
        <div class="w-ways">
          <div class="w-ways-head">Womit schreibst du deine Mails?</div>
          <div class="w-ways-row">
            <a class="w-way" data-way="app" href="#">📧 Mail-Programm</a>
            <a class="w-way" data-way="gmail" href="#" target="_blank" rel="noopener">Gmail</a>
            <a class="w-way" data-way="outlook" href="#" target="_blank" rel="noopener">Outlook / Hotmail</a>
            <button type="button" class="w-tpl">📋 Vorlage kopieren</button>
          </div>
          <p class="g-note">GMX, WEB.DE, T-Online oder ein anderer Anbieter: „Vorlage kopieren“, dort eine neue Mail an die
            Adresse oben schreiben und den Text einfügen. Fotos, Töne oder Modelle hängst du an die Mail an.</p>
        </div>
        <p class="g-note">Du kannst Ideen schicken und Material, das ins Spiel soll: Fotos von Hausfassaden, Töne und Musik,
          3D-Modelle (GLB) oder animierte Figuren. Ich schaue mir alles an.</p>
        <ul class="w-rules">
          <li>Nur eigene Sachen (selbst fotografiert, aufgenommen oder gebaut) oder Material mit freier Lizenz, dann bitte mit Quelle.</li>
          <li>Auf Fotos keine Personen und keine Autokennzeichen.</li>
          <li>Nur nette und erlaubte Ideen.</li>
          <li>Mit dem Einsenden erlaubst du, dass das Material im Spiel verwendet wird. Beim Vorschlag steht dann dein Spielname.</li>
          <li>Unter 16? Frag vorher deine Eltern.</li>
        </ul>
        <div class="w-list"></div>
        <button type="button" class="btn g-close g-close-bottom">◀ Zurück</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const body = root.querySelector('.g-body'), list = root.querySelector('.w-list');
  const mailBtn = root.querySelector('.w-mail'), emailEl = root.querySelector('.w-email'), copyBtn = root.querySelector('.w-copy');
  const ways = root.querySelector('.w-ways'), tplBtn = root.querySelector('.w-tpl');
  let open = false, email = FALLBACK_MAIL;

  const setEmail = (m) => {
    email = m || FALLBACK_MAIL; emailEl.textContent = email;
    for (const a of root.querySelectorAll('[data-way]')) a.href = WAYS[a.dataset.way](email);
  };
  const showWays = (on) => { ways.classList.toggle('open', on); mailBtn.setAttribute('aria-expanded', String(on)); };
  const copy = (text, btn, label) => {
    navigator.clipboard?.writeText(text).then(() => { btn.textContent = label; }, () => { btn.textContent = 'Kopieren ging nicht'; });
  };
  setEmail(FALLBACK_MAIL);

  function item(it) {
    const done = it.status === 'erledigt', busy = it.status === 'arbeit';
    const row = el('div', 'w-item' + (done ? ' done' : ''));
    row.append(el('span', 'w-check', done ? '☑' : '☐'));
    const col = el('div', 'w-col');
    const head = el('div', 'w-title', it.titel || '');
    if (busy) head.append(el('span', 'w-badge', 'in Arbeit'));
    col.append(head);
    if (it.text) col.append(el('div', 'w-text', it.text));
    const meta = [];
    if (it.von) meta.push(`💡 Vorschlag von ${it.von}`);
    if (done && it.fertig) meta.push(`✓ erledigt am ${fmtDate(it.fertig)}`);
    else if (it.datum) meta.push(`eingetragen am ${fmtDate(it.datum)}`);
    if (meta.length) col.append(el('div', 'w-meta', meta.join(' · ')));
    row.append(col);
    return row;
  }
  function render(data) {
    list.replaceChildren();
    const items = Array.isArray(data?.items) ? data.items.filter((i) => i && i.titel) : [];
    const todo = items.filter((i) => i.status !== 'erledigt');
    const done = items.filter((i) => i.status === 'erledigt');
    todo.sort((a, b) => (b.status === 'arbeit') - (a.status === 'arbeit'));       // in Arbeit zuerst
    for (const [title, arr, empty] of [['Geplant', todo, 'Gerade nichts offen – schick deine Idee!'], ['Erledigt', done, 'Noch nichts abgehakt.']]) {
      const sec = el('section');
      sec.append(el('h3', null, `${title} (${arr.length})`));
      if (!arr.length) sec.append(el('p', 'g-note', empty));
      for (const it of arr) sec.append(item(it));
      list.append(sec);
    }
  }
  async function load() {
    list.replaceChildren(el('p', 'g-note', 'Liste wird geladen …'));
    try {
      const r = await fetch(`${URL_LIST}?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      setEmail(typeof data.email === 'string' && /^[^\s@<>"]+@[^\s@<>"]+$/.test(data.email) ? data.email : FALLBACK_MAIL);
      render(data);
    } catch (e) {
      list.replaceChildren(el('p', 'g-note', 'Die Liste ist gerade nicht erreichbar. Vorschläge kannst du trotzdem schicken.'));
    }
  }

  const api = {
    get isOpen() { return open; },
    open() {
      open = true; root.style.display = 'flex'; body.scrollTop = 0; showWays(false);
      copyBtn.textContent = 'Adresse kopieren'; tplBtn.textContent = '📋 Vorlage kopieren'; load();
    },
    close() { open = false; root.style.display = 'none'; },
  };
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.w-mail')) { e.preventDefault(); showWays(!ways.classList.contains('open')); return; }
    if (e.target.closest('.w-copy')) { copy(email, copyBtn, 'Kopiert ✓'); return; }
    if (e.target.closest('.w-tpl')) { copy(`An: ${email}\nBetreff: ${SUBJECT}\n\n${BODY}`, tplBtn, 'Vorlage kopiert ✓'); return; }
    if (e.target.closest('.g-close') || e.target === root) api.close();
  });
  addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); api.close(); } }, true);
  return api;
}
