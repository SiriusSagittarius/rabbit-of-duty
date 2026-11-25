// Anleitung: wie man den Besen steuert. Knopf „📖 Anleitung“ im Startmenü und in der Pause.
//
// Zwei Reiter: PC (Tastatur und Maus) und Handy (Neigen und Knöpfe), voreingestellt nach Gerät. Die Minigun steht
// nur drin, wenn sie eingeschaltet ist (MINIGUN_AN), die Kampf-Steuerung nur, wenn die Kampfmodi sichtbar sind.
// Schließen: Zurück-Knopf, Esc oder Klick neben das Fenster.

const k = (...names) => names.map((n) => `<kbd>${n}</kbd>`).join(' ');
const rows = (list) => list.map(([keys, text]) => `<div class="g-k">${keys}</div><div class="g-t">${text}</div>`).join('');
const sec = (title, list, note = '') =>
  `<section><h3>${title}</h3>${list.length ? `<div class="g-grid">${rows(list)}</div>` : ''}${note ? `<p class="g-note">${note}</p>` : ''}</section>`;

function pcHtml({ minigun, kampf }) {
  return [
    sec('Fliegen', [
      [k('Maus'), 'lenken: Du fliegst dorthin, wohin du schaust'],
      [`${k('W')} oder ${k('Maus 3')}`, 'Schub (Maus 3 = mittlere Maustaste). Loslassen: Du gleitest aus und schwebst.'],
      [k('S'), 'bremsen'],
      [`${k('A')} ${k('D')}`, 'seitlich nach links / rechts'],
      [k('Leertaste'), 'steigen'],
      [`${k('C')} oder ${k('Strg')}`, 'sinken'],
      [k('Shift'), 'Boost: noch schneller (zusammen mit Schub)'],
    ], 'Gebäude und Bäume halten dich auf, über den Dächern ist frei.'),
    sec('Kunststücke', [
      [`${k('Q')} ${k('E')}`, 'Fassrolle links / rechts'],
      [`${k('R')} ${k('F')}`, 'Looping nach oben / nach unten'],
      [`${k('Z')} ${k('U')}`, 'Steilspirale links / rechts (auf englischer Tastatur Y statt Z)'],
      [k('Mausrad'), 'Korkenzieher: hoch = nach vorne, runter = nach hinten'],
      [k('T'), 'Trick'],
    ]),
    sec(minigun ? 'Energieball, Schild und Minigun' : 'Energieball und Schild', [
      [`${k('V')} oder ${k('rechte Maustaste')}`, 'Energieball spucken'],
      [k('X'), 'Schutzschild: 6 Sekunden an, danach 8 Sekunden laden'],
      ...(minigun ? [[`${k('linke Maustaste')} halten`, 'Minigun: Die Läufe laufen kurz an, dann kommt Dauerfeuer']] : []),
    ], 'Treffer machen nichts kaputt: Ohne Schild wirst du kurz ausgebremst, mit Schild kostet ein Treffer Schildenergie.'),
    sec('Karte, Navi und Autopilot', [
      [`${k('N')} oder ${k('Tab')}`, 'Karte öffnen und wieder schließen'],
      ['Klick auf die Karte', 'Ziel setzen, eine Leuchtlinie führt dich hin. Rechtsklick löscht das Ziel.'],
      [`${k('1')} … ${k('9')} oder „🧭 Weg“`, 'Weg zu einem Mitflieger zeigen: Leuchtband in der Luft, Pfeil oben, Linie im Radar'],
      [`${k('P')} oder „🤖 Autopilot“`, 'Der Besen fliegt selbst zum Mitflieger und dann neben ihm her. Nochmal P: aus.'],
      ['selbst lenken', `${k('W')} ${k('A')} ${k('S')} ${k('D')}, ${k('Leertaste')}, ${k('C')} oder die Maus kräftig bewegen schaltet den Autopiloten aus`],
    ], 'Mitflieger gibt es, wenn ihr im Team fliegt (Startmenü → Losfliegen → Im Team fliegen).'),
    sec('Sonstiges', [
      [k('M'), 'Musik an / aus'],
      [k('Esc'), 'Pause. Dort kannst du den Flug beenden und dich in die Bestenliste eintragen.'],
    ]),
    kampf ? sec('Zu Fuß und im Kampf (andere Spielmodi)', [
      [`${k('W')} ${k('A')} ${k('S')} ${k('D')}`, 'laufen'],
      [k('Maus'), 'umsehen'],
      [k('linke Maustaste'), 'schießen'],
      [k('rechte Maustaste'), 'zielen'],
      [`${k('1')} ${k('2')} oder ${k('Mausrad')}`, 'Waffe wechseln'],
      [k('R'), 'nachladen'],
      [k('G'), 'Granate'],
      [k('E'), 'Nahkampf'],
      [k('Shift'), 'sprinten'],
      [k('Leertaste'), 'springen'],
      [`${k('C')} oder ${k('Strg')}`, 'ducken'],
      [`${k('X')} oder ${k('Y')}`, 'hinlegen'],
      [k('B'), 'Flugbesen rufen oder absteigen'],
    ]) : '',
  ].join('');
}

function touchHtml() {
  return [
    sec('Halten und lenken', [
      ['📱 quer halten', 'Beim Start gilt die Haltung als Mitte.'],
      ['nach rechts / links kippen', 'Kurve'],
      ['nach vorne / hinten kippen', 'nach unten / nach oben schauen. Du fliegst dorthin, wohin du schaust.'],
      ['Wischen', 'auf einer freien Stelle: Sicht drehen (geht auch ohne Neigen)'],
    ], 'Wenn das Neigen nicht klappt: Das Handy gibt die Neigung nur auf der Internetseite des Spiels frei (https), iPhones fragen einmal nach Erlaubnis. Wischen geht immer.'),
    sec('Knöpfe', [
      [k('SCHUB'), 'rechts unten, gedrückt halten: fliegen'],
      [k('BREMSE'), 'bremsen'],
      [`${k('▲')} ${k('▼')}`, 'links: steigen / sinken'],
      [k('🌀'), 'Korkenzieher'],
      [k('⟲ Mitte'), 'die jetzige Haltung als Mitte nehmen'],
      [k('📱 Neigen'), 'Lenken mit Neigen an / aus'],
      [k('⏸'), 'Pause'],
    ]),
    sec('Navi und Autopilot', [
      [k('🧭 Navi'), 'Karte mit deinen Mitfliegern öffnen'],
      ['„🧭 Weg“', 'zeigt den Weg zum Mitflieger: Leuchtband in der Luft, Pfeil oben, Linie im Radar'],
      ['„🤖 Autopilot“', 'Der Besen fliegt selbst hin und dann neben ihm her'],
      [`${k('SCHUB')} ${k('BREMSE')} ${k('▲')} ${k('▼')}`, 'Du lenkst wieder selbst, der Autopilot geht aus'],
    ], 'Mitflieger gibt es, wenn ihr im Team fliegt (Losfliegen → Im Team fliegen).'),
  ].join('');
}

const GOAL = `<p class="g-goal">Flieg auf dem Besen durch Much und finde die <b>15 goldenen Lichtsäulen</b>. Der Kompass oben
  zeigt zum nächsten Ort. Jeder Ort gibt Punkte, alle zusammen einen Zeitbonus. Im Team findet ihr die Orte gemeinsam.</p>
  <p class="g-goal">Das <b>Radar</b> oben rechts zeigt 250 m weit: blaue Punkte sind Mitflieger (▲ / ▼ = deutlich höher oder
  tiefer, Ring = Schild an), goldene Rauten sind noch offene Orte. Über jedem Mitflieger steht sein Name mit Abstand.</p>`;

export function createGuide({ touch = false, minigun = true, kampf = false } = {}) {
  const root = document.createElement('div');
  root.id = 'guide'; root.className = 'ovp';
  root.innerHTML = `
    <div class="g-box" role="dialog" aria-label="Anleitung">
      <div class="g-head">
        <b>📖 ANLEITUNG</b>
        <div class="g-tabs"><button type="button" data-tab="pc">💻 PC</button><button type="button" data-tab="touch">📱 Handy</button></div>
        <button type="button" class="g-close">◀ Zurück</button>
      </div>
      <div class="g-body">
        ${GOAL}
        <div class="g-page" data-page="pc">${pcHtml({ minigun, kampf })}</div>
        <div class="g-page" data-page="touch">${touchHtml()}</div>
        <button type="button" class="btn g-close g-close-bottom">◀ Zurück</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const body = root.querySelector('.g-body');
  let open = false;

  const show = (tab) => {
    for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const p of root.querySelectorAll('[data-page]')) p.style.display = p.dataset.page === tab ? 'block' : 'none';
  };
  const api = {
    get isOpen() { return open; },
    open(tab = touch ? 'touch' : 'pc') {
      show(tab); open = true; root.style.display = 'flex'; body.scrollTop = 0;
    },
    close() { open = false; root.style.display = 'none'; },
  };
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    const tab = e.target.closest('[data-tab]');
    if (tab) { show(tab.dataset.tab); body.scrollTop = 0; return; }
    if (e.target.closest('.g-close') || e.target === root) api.close();
  });
  addEventListener('keydown', (e) => { if (open && e.code === 'Escape') { e.stopPropagation(); api.close(); } }, true);
  return api;
}
