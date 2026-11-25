// Wunschliste: Vorschläge für Flying Much, Knopf „💡 Wunschliste“ im Startmenü und in der Pause.
//
// Die Einträge stehen in wunschliste.json (vom Entwickler gepflegt, wird bei jedem Öffnen frisch geladen):
//   { email, items: [{ id, titel, text, von, status: 'offen' | 'arbeit' | 'erledigt', datum, fertig }] }
// Oben: Mail-Knopf mit Vorlage an die Adresse aus der Datei, Adresse zum Kopieren, Regeln fürs Einsenden.
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

function mailHref(email) {
  const subject = 'Flying Much – Vorschlag';
  const body = [
    'Mein Spielname (steht dann beim Vorschlag in der Liste):', '', '',
    'Mein Vorschlag:', '', '', '',
    'Material im Anhang (Fotos, Töne, Musik, 3D-Modelle):', '',
    'Selbst gemacht? Oder woher stammt es (Quelle und Lizenz)?', '', '',
  ].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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
          <a class="btn primary w-mail" href="#">✉️ Vorschlag oder Material schicken</a>
          <div class="w-addr"><span class="w-email"></span><button type="button" class="w-copy">Adresse kopieren</button></div>
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
  let open = false, email = FALLBACK_MAIL;

  const setEmail = (m) => { email = m || FALLBACK_MAIL; emailEl.textContent = email; mailBtn.href = mailHref(email); };
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
    open() { open = true; root.style.display = 'flex'; body.scrollTop = 0; copyBtn.textContent = 'Adresse kopieren'; load(); },
    close() { open = false; root.style.display = 'none'; },
  };
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.w-copy')) {
      navigator.clipboard?.writeText(email).then(() => { copyBtn.textContent = 'Kopiert ✓'; }, () => { copyBtn.textContent = email; });
      return;
    }
    if (e.target.closest('.g-close') || e.target === root) api.close();
  });
  addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); api.close(); } }, true);
  return api;
}
