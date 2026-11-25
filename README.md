# Flying Much 🧹

Ein Flugspiel für den Browser, gebaut mit [Three.js](https://threejs.org/). Auf dem Besen geht es über **Muchtown**,
den Ortskern von Much im Bergischen Land: Das Dorf ist aus amtlichen offenen Geodaten nachgebaut, mit echtem Gelände,
echten Häusern, Luftbild, Bäumen und Straßen. Das Spiel läuft ohne Installation im Browser, auch auf Laptops mit
integrierter Grafik.

Ein unabhängiges, nicht kommerzielles Hobbyprojekt, gedacht auch für Kinder: Es gibt kein Blut und keine Lebenspunkte,
niemand scheidet aus. Energieball und Minigun am Besen bremsen getroffene Mitflieger nur kurz aus oder kosten Schildenergie.
Die früheren Kampfmodi (Zombies, Söldner, Deathmatch, Waffenkammer) stecken noch im Code, sind aber ausgeblendet:
`KAMPF_SICHTBAR` in `src/main.js` schaltet sie wieder ein. Die Abschnitte dazu weiter unten gelten nur dann.

## Was drinsteckt

### Spiel

- **Zombie-Überleben:** Wilder Zombie, Verwesender Zombie und Gefräßiger Koloss kommen in Runden. Punkte und
  Combos zählen.
  - Ein zweiter Modus gegen Soldaten (Späher, Schwerer Soldat, Sturmsoldat) steckt im Code. Er ist vorerst
    ausgeblendet, `SOELDNER_SICHTBAR` in `src/main.js` schaltet ihn wieder ein.
- **Munitionskisten:** Im Einzelspiel taucht immer wieder eine Kiste in der Nähe auf, erkennbar an einer Lichtsäule
  und einem gelben Punkt auf dem Radar. Drüberlaufen füllt die Reserve aller Waffen auf und bringt eine Granate.
- **Bestenliste:** Am Ende eines Flugs kommt dein Ergebnis mit deinem Spielnamen in die Liste, getrennt nach Karte
  und Modus. Eintragen geht nur mit **Google-Anmeldung** (freiwillig, Fliegen geht ohne). In der Liste steht der
  Spielname, vom Konto speichert der Server nur eine pseudonyme Kennung, damit jedes Konto einmal vorkommt. Googles
  Skript lädt erst nach dem Klick auf „Mit Google anmelden“. Im Menü zeigt **Bestenliste** die besten zehn.
- **Sieben Karten:** Muchtown (Standard), OpenStreetMap 3D (Potsdamer Platz, Berlin), Dämmerungs-Stadt,
  Luxus-Atrium, Industrie-Lagerhalle, Wüsten-Außenposten und Nacht-Einsatz.
- **Neun Waffen und eine Granate:** Ausgewählt werden sie in der Waffenkammer.
  - Zielen über Kimme und Korn, Rotpunkt oder Zielfernrohr.
  - Rückstoßmuster, Nachladen mit Animation, Nahkampf.
- **Bewegung:** sprinten, springen, ducken, hinlegen.
- **Flugbesen:** Mit **B** rufst du im Einzelspiel den Besen und fliegst, wohin du schaust, auch über die Dächer
  von Muchtown. Schub gibt die mittlere Maustaste oder W. Das Mausrad dreht eine Spirale nach vorne oder hinten,
  und mit Linksklick zauberst du. Gebäude halten dich auf, über den Dächern ist frei.
- **Karte und Navi:** Ziel auf der Karte anklicken, dann der Leuchtlinie am Boden folgen. Die Route führt bevorzugt
  über Straßen und Wege, mit Abbiegehinweisen und auf Wunsch mit Sprachansage.
- **Mehrspieler:** 1 gegen 1 im Heimnetz über einen kleinen Server (siehe unten).
- **Erkundungsflug:** ohne Gegner auf dem Besen durch Muchtown. Vor dem Start gibst du einen Namen ein. Goldene
  Lichtsäulen markieren 15 Orte, darunter Kirche, Rathaus, Brunnen, Läden und die Kirchturmspitze. Ein Kompass zeigt
  zum nächsten Ort. Jeder Fund gibt Punkte, und wer alle findet, bekommt einen Zeitbonus. Das Ergebnis kommt mit
  deinem Namen in die Bestenliste. **Im Team** fliegen bis zu 8 Spieler zusammen über den Server. Jeder sieht die
  anderen mit Namen und Abstand über dem Kopf, und die Funde zählen für alle. Das Radar oben rechts reicht 250 m
  weit: blaue Punkte mit Namen sind die Mitflieger (▲/▼ deutlich höher oder tiefer, Ring = Schild an), goldene Rauten
  die noch offenen Orte. Wer weiter weg ist, steht blasser am Rand und zeigt die Richtung.
- **Navi zu Mitfliegern und Autopilot:** In der Karte (N) stehen rechts alle Mitflieger mit Abstand. „Weg“ (oder
  Taste 1–9) zeigt die Luftroute zu ihm: ein Leuchtband über die Dächer, oben ein Hinweis mit Richtung, Abstand und
  Höhe, im Radar eine Linie. Das Ziel wandert mit, wenn er weiterfliegt. „Autopilot“ (oder Taste P im Flug) fliegt
  selbst hin, weit weg mit Boost, und bleibt dann neben ihm (Begleitflug). Wer selbst lenkt (W/A/S/D, Leertaste, C,
  Maus kräftig bewegen, am Handy die Knöpfe), übernimmt wieder. Am Handy öffnet der Knopf „🧭 Navi“ die Karte.
- **Besen-Manöver, Energiebälle, Schild:** Auf dem Besen fliegst du Looping, Fassrolle, Steilspirale und Korkenzieher
  und zeigst einen Trick. Im Erkundungsflug spuckst du dazu Energiebälle und schaltest einen Schutzschild ein. Die
  Mitflieger sitzen als Soldat auf dem Hexenbesen (`assets/models/soldier/SoldierBesen.glb`, gebaut in Blender) und
  zeigen alles mit: Manöver, Lenken, Boost, Spucken und den Schild. Ein Treffer bremst nur kurz aus, mit Schild kostet
  er ein Viertel Schildenergie. Lebenspunkte gibt es nicht. Unter dem Besenstiel hängt eine Minigun: Linke Maustaste
  halten, die Läufe laufen an, dann gibt es Dauerfeuer mit Leuchtspur (Treffer bremsen bzw. kosten Schildenergie). Wer
  stillsteht, schwebt locker auf dem Besen und streckt sich, gähnt oder klopft auf den Stiel. Abschalten lässt sich die
  Minigun mit `MINIGUN_AN = false` in `src/main.js`.
- **Wunschliste:** Im Start- und Pausemenü steht „💡 Wunschliste“: geplante und erledigte Wünsche (abgehakt), jeweils
  mit dem Namen dessen, der sie vorgeschlagen hat. Ein Knopf öffnet eine Mail mit Vorlage an flyingmuch@hapaluv.de,
  dorthin schicken Spieler Vorschläge und Material (Fotos, Töne, Musik, 3D-Modelle). Gepflegt wird die Liste in
  `wunschliste.json` (siehe „Erweitern“).
- **Wer ist online:** Im Menü steht „🟢 3 online · 12 heute · 345 gesamt“. Wer mit Spielnamen das Spiel öffnet oder
  verlässt, wird allen anderen kurz angezeigt („Lars ist dem Spiel beigetreten“). Der Besucherzähler kommt ohne
  Cookies aus: Der Server zählt Besucher je Tag über einen Hash aus IP-Adresse, Browserkennung und einem täglich neuen
  Zufallswert, der nur im Arbeitsspeicher liegt, und speichert nur die Zahlen (`server/data/stats.json`).
- **Handy:** Auf Handy und Tablet startet der Erkundungsflug im Querformat. Neigen lenkt: nach vorne kippen heißt
  sinken, nach hinten steigen, rechts und links Kurve fliegen. Rechts liegen Schub, Bremse und Spirale, links Hoch und
  Runter, oben Pause, „Mitte“ (Haltung neu ausrichten) und Neigen an/aus. Wischen dreht die Sicht. Die
  Neigungssensoren gibt der Browser nur über HTTPS frei, iPhones fragen einmal nach Erlaubnis.

### Muchtown: Much als echtes Dorf

- **Gelände** aus dem digitalen Geländemodell DGM1 (1-m-Raster). Spieler, Gegner und Granaten folgen den echten Hügeln.
- **Häuser** aus dem amtlichen 3D-Gebäudemodell LoD2: echte Grundrisse, Höhen, Dachformen und Hausnummern.
- **Dächer und Boden** aus dem Luftbild mit 25 cm pro Pixel.
- **Bäume** an ihren echten Standorten in echter Höhe.
- **Straßen, Wege und Straßennamen** aus OpenStreetMap.
- **18 Läden an der Hauptstraße** (Nr. 19 bis 34) haben ihren echten Haustyp und eine gezeichnete Ladenfront mit
  Schriftzug. Haustypen sind Fachwerk, Schiefer, Putz, Klinker und Naturstein. Erste Fassaden zeigen schon
  eigene Fotos (Nr. 25, 27, Erdgeschoss von 29, Schild von 28). Dazu gezeichnete Fronten für Nr. 12 bis 17,
  Nr. 36 bis 50 (Billard-Vereinsheim bis Rathaus-Grill), Nr. 37 bis 53 auf der Gegenseite (Gothaer und Glücklich
  bis TintenPro und BIANGA) und die VR-Bank am Platz gegenüber der Kirche.
- **Schulstraße:** rund 30 Wohnhäuser mit gezeichneter Fassade über die ganze Wand (Fenster, Klappläden,
  Rollläden, Haustüren, Schiefer- und Klinkerwände), dazu die Neuapostolische Kirche und der Friseur an Nr. 21.
- **St. Martinus mit Turm:** Im LoD2 fehlt der Kirchturm. Er ist nachgebaut (Maße aus dem 3D-Mesh von Geobasis NRW),
  mit Portal, Turmuhr und Schieferhelm; dazu der Kugelbrunnen vor der Bank.
- **Spielfläche** 930 × 540 m. Start ist an der Hauptstraße beim Rathaus.

### Technik

- **Ohne Build-Schritt:** Three.js r183 und reines JavaScript. Three.js liegt im Repo, fürs Einzelspiel ist kein
  Internet nötig.
- **Gebaut für schwache Grafikchips:**
  - Die Auflösung regelt sich nach der gemessenen GPU-Zeit.
  - Das Gelände liegt in Kacheln mit vier Detailstufen.
  - Häuser und Bäume sind zu wenigen großen Meshes zusammengefasst.
  - Alle Ladenfronten teilen sich einen Texturatlas.
  - Shader werden vorab übersetzt, damit es beim ersten Schuss nicht ruckelt.
- **Waffen in der Hand:** eigene Szene, Handschuh-Hände und Animationen. Die meisten Waffen sind direkt aus Code
  gebaut, zwei sind texturierte Modelle aus KI-Generatoren.

### Entstehung

Entwickelt mit Unterstützung von KI-Assistenten: Claude (Anthropic) und Gemini (Google).

## Selbst spielen

Du brauchst einen aktuellen Browser mit WebGL 2 (Chrome, Edge oder Firefox). Für den kleinen lokalen Webserver
brauchst du außerdem Python 3.

1. Herunterladen:

   ```bash
   git clone https://github.com/SiriusSagittarius/rabbit-of-duty.git
   ```

   Oder auf GitHub **Code → Download ZIP** wählen und entpacken.
2. Im Ordner den Webserver starten:

   ```bash
   cd rabbit-of-duty
   python -m http.server 8080 --bind 127.0.0.1
   ```

   Ein Doppelklick auf `index.html` reicht nicht, weil Browser die Spielmodule nur über HTTP laden.
3. Im Browser <http://localhost:8080> öffnen, Karte und Modus wählen und auf den Startbildschirm klicken.
   Der Klick fängt die Maus ein, `Esc` gibt sie wieder frei.

Das Zombie-Modell ist nicht im Repo, weil seine Lizenz kein Hochladen erlaubt. Ohne das Modell erscheinen einfache
Ersatz-Zombies. Wie du das echte Modell einrichtest, steht unter [Zombie-Modell einrichten](#zombie-modell-einrichten).

### Mehrspieler und Bestenliste (optional)

Beides läuft über denselben kleinen Server. Dafür brauchst du zusätzlich Node.js 22 oder neuer.

```bash
cd server
npm install
npm start          # Server auf Port 2567: Mehrspieler, Erkundungsflug im Team, Lobby und Bestenliste
```

Die Bestenliste speichert der Server in `server/data/highscores.json`. Läuft kein Server, zeigt das Spiel nur deinen
eigenen Rekord.

- **Webserver:** Starte ihn dafür ohne `--bind 127.0.0.1`, damit er im Heimnetz erreichbar ist. Mach das nur in
  einem vertrauenswürdigen Netz.
- **Spiel öffnen:** Alle öffnen das Spiel über die IP-Adresse des Rechners, auf dem der Server läuft, zum Beispiel
  `http://192.168.178.20:8080`, und wählen **Mehrspieler (LAN)**.
- **Server auf einem anderen Rechner:** Hänge `?server=ws://adresse:2567` an die Adresse des Spiels.
- **Nur auf diesem Rechner:** `HOST=127.0.0.1 npm start` lässt den Server nur lokale Verbindungen annehmen.
- **Google-Anmeldung:** Der Server prüft die Anmeldung gegen Googles öffentliche Schlüssel (`server/src/google-auth.ts`).
  Die Client-ID steht in `src/auth.js` und als Vorgabe im Server (`GOOGLE_CLIENT_ID` überschreibt sie). Lokal klappt
  die Anmeldung nur über `http://localhost:8080`, nicht über `127.0.0.1`. `HS_NO_AUTH=1` erlaubt Einträge ohne
  Anmeldung (nur zum Testen), `HS_SALT` setzt das Salz für die pseudonyme Kennung.

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | bewegen |
| Maus | umsehen |
| Linksklick | schießen |
| Rechtsklick | zielen |
| R | nachladen |
| Shift | sprinten |
| Leertaste | springen |
| C | ducken |
| X | hinlegen |
| 1 / 2 / Mausrad | Waffe wechseln (Primär / Sekundär) |
| E oder V | Nahkampf (Messer bzw. Stoß mit der Waffe) |
| G | Granate werfen |
| N oder Tab | Karte und Navi |
| B | Flugbesen rufen oder absteigen (nur im Einzelspiel) |
| M | Musik an oder aus |
| Esc | Pause |

Auf dem Besen (dieselbe Übersicht steht im Spiel unter „📖 Anleitung“ im Startmenü und in der Pause, mit eigenem Reiter fürs Handy):

| Taste | Aktion |
|---|---|
| Maus | lenken (man fliegt in Blickrichtung) |
| mittlere Maustaste oder W | Schub |
| S | bremsen |
| A / D | seitlich |
| Leertaste / C oder Strg | steigen / sinken |
| Shift | Boost |
| Mausrad hoch / runter | Korkenzieher nach vorne / nach hinten |
| Q / E | Fassrolle links / rechts |
| R / F | Looping nach oben / nach unten |
| Z / U | Steilspirale links / rechts |
| T | Trick |
| Linksklick | zaubern (nicht im Erkundungsflug) |
| V oder rechte Maustaste | Energieball spucken (Erkundungsflug) |
| X | Schutzschild, 6 Sekunden, danach 8 Sekunden Pause (Erkundungsflug) |
| linke Maustaste (halten) | Minigun: Läufe laufen an, dann Dauerfeuer (Erkundungsflug) |
| N oder Tab | Karte mit Mitflieger-Liste: Weg zeigen (1–9) oder Autopilot (P) |
| P | Autopilot zum gewählten (sonst zum nächsten) Mitflieger an / aus (Erkundungsflug im Team) |

## Projektaufbau

| Pfad | Inhalt |
|---|---|
| `index.html` | Ladefenster, Menüs, HUD und Styles |
| `src/main.js` | Spiellogik: Renderer, Karten, Spieler, Gegner, Wellen, HUD, Mehrspieler-Anbindung |
| `src/arsenal.js` | Waffenliste, Feuermodi, Rückstoß, Nachladen, Nahkampf, Granate |
| `src/weapons/` | Waffen in der Hand: Hände, Animationen, Materialien und Modelle (`models/`) |
| `src/osm-level.js`, `src/nrw-level.js` | Kulissen aus OpenStreetMap und aus den NRW-Geodaten |
| `src/much-shops.js` | Ladenfronten an der Hauptstraße in Much |
| `src/much-houses.js` | Wohnhausfassaden an der Schulstraße in Much |
| `src/much-landmarks.js` | Kirchturm von St. Martinus, Kugelbrunnen, Wandtexturen für Kirche und Bank |
| `src/navmap.js` | Karte und Navi, Mitflieger-Liste und Luftroute im Erkundungsflug |
| `src/autopilot.js` | Autopilot: fliegt die Luftroute zum Mitflieger, dann Begleitflug |
| `src/wishlist.js`, `wunschliste.json` | Wunschliste im Menü und ihre Einträge |
| `src/guide.js` | Anleitung (Startmenü „📖 Anleitung“ und Pause): Besen-Steuerung für PC und Handy |
| `src/zombie-pak.js` | öffnet das verschlüsselte Zombie-Paket |
| `src/pickups.js` | Munitionskisten |
| `src/broom.js` | Flugbesen: Flugphysik, Manöver, Boost, Zauber, Fluggeräusch |
| `src/flight-moves.js` | Kurven der Besen-Manöver, gemeinsam für den eigenen Flug und die Mitflieger |
| `src/flyer.js` | Mitflieger: Soldat auf dem Besen mit Animationen, Schild und nachgespielten Manövern |
| `src/energyball.js` | Energiebälle: Flug, Treffer, Aufprall |
| `src/shield.js` | Schutzschild-Effekt (Shader mit Blitz-Adern, Treffer-Welle, Farbstufen) |
| `blender/` | Blender-Quelle des Besen-Soldaten (nur zum Bearbeiten, das Spiel lädt die `.glb`) |
| `src/explore.js` | Erkundungsflug: Orte, Lichtsäulen, Punkte, Kompass |
| `src/touch.js` | Handy-Steuerung: Neigen (DeviceOrientation) und Touch-Knöpfe |
| `src/highscore.js` | Bestenliste: Abruf und Eintragen beim Server |
| `src/auth.js` | Anmeldung mit Google (nur für die Bestenliste) |
| `src/presence.js` | Wer ist online: Lobby, Beitritts-Meldungen, Besucherzähler |
| `datenschutz.html` | Datenschutzhinweise |
| `credits.html` | Credits und Lizenzhinweise (u. a. Minigun-Modell, CC BY 4.0) |
| `src/music.js`, `audio/` | Musik und Soundeffekte |
| `src/net.js`, `server/` | Mehrspieler mit Colyseus (Räume `arena`, `explore` und `lobby`), Bestenliste (`server/src/highscores.ts`) und Besucherzähler (`server/src/visitors.ts`) |
| `assets/` | Kartendaten (`nrw/`, `osm/`), Modelle und Sounds |
| `ui/` | Vorschaubilder der Karten (`maps/`) und Waffen (`armory/`), Bild des Flugbesens |
| `tools/` | Werkzeuge für Kartendaten, Fassadenfotos, Sounds und das Zombie-Modell (Python, Packen mit Node) |
| `vendor/three/` | Three.js |

## Erweitern

### Wunschliste pflegen

Die Einträge stehen in `wunschliste.json`. Das Spiel lädt die Datei bei jedem Öffnen der Wunschliste neu: Hochladen
genügt, ein neuer `?v=` ist nicht nötig. Neue Einträge kommen oben in `items`:

```json
{ "id": "kirchturm-glocken", "titel": "Glocken im Kirchturm", "text": "Zur vollen Stunde läuten die Glocken.",
  "von": "Lena", "status": "offen", "datum": "2026-11-26" }
```

`status` ist `offen`, `arbeit` (wird gerade gebaut, steht oben mit „in Arbeit“) oder `erledigt`. Bei `erledigt` kommt
`"fertig": "JJJJ-MM-TT"` dazu, dann ist der Punkt abgehakt. `von` ist der Spielname aus der Mail. `email` oben in der
Datei ist die Adresse, an die der Mail-Knopf schickt.

### Weitere Orte

Einen Ort aus OpenStreetMap holen. Die Koordinaten bekommst du auf openstreetmap.org mit Rechtsklick → „Adresse anzeigen“:

```bash
python tools/osm_fetch.py meinort 50.9052 7.4079 --radius 380
```

Danach den ausgegebenen Eintrag in `src/osm-level.js` unter `OSM_LOCATIONS` ergänzen und in `src/main.js` eine
Karte in `MAP_CONFIGS` anlegen.

Für Orte in Nordrhein-Westfalen holt `tools/nrw_fetch.py` zusätzlich Gelände, Häuser und Luftbild.
Dafür braucht Python die Pakete numpy und Pillow.

```bash
python tools/nrw_fetch.py much 50.904981 7.402773 --radius 640 --terrain 720 --near 512
```

### Eigene Waffen

- **Als Code-Modell:** eine Datei in `src/weapons/models/` (Vorlage: `rifle.js`) und dazu ein Eintrag in `CATALOG`
  in `src/arsenal.js`.
- **Als fertiges GLB-Modell,** etwa aus Tripo oder Meshy: Erst verkleinern, dann wie `ak_tripo` oder `pistol_meshy`
  in `CATALOG` eintragen.

```bash
npx @gltf-transform/cli optimize roh.glb assets/models/weapons/neu.glb --compress false \
  --texture-compress webp --texture-size 1024 --simplify-ratio 0.02 --simplify-error 0.004 --join false
```

### Ladenfronten

In `src/much-shops.js` steht je Adresse ein Eintrag mit Haustyp, Farbe und einer Funktion, die die Front zeichnet.
Es gibt diese Zusatzoptionen:

| Option | Wirkung |
|---|---|
| `face` | Himmelsrichtung der Front, wenn der Laden nicht zur Straße zeigt |
| `near` | wählt die richtige Wand, wenn ein Haus mehrere Straßenseiten hat |
| `more` | weitere Fronten am selben Haus |
| `full` | Bild über die ganze Wand bis in den Giebel |
| `photo` | eigenes, entzerrtes Foto der ganzen Wand statt der gezeichneten Front |
| `photos` | Fotos, die die Zeichenfunktion einsetzt, z. B. ein Ladenschild (`P.photo(name, x0, x1, h0, h1)`) |
| `street` | Straße, zu der die Front zeigt (sonst die Straße der Hausadresse) |
| `raise` | stockt ein Haus um so viele Meter auf, wenn es nach dem LoD2-Stand erhöht wurde |
| `px` | Auflösung im Texturatlas (Pixel je Meter, Standard 64; die Wohnhäuser nutzen 40) |

Eigene Fotos entzerren: Quellbild, vier Eckpunkte und Wandmaß in `tools/fronts.json` eintragen, dann
`python tools/rectify_fronts.py` (braucht Pillow und NumPy). Ergebnis: `assets/nrw/much/fronts/<name>.webp`.
Die Rohbilder in `assets/imgmuch/` bleiben lokal, sie können Personen oder Kennzeichen zeigen.

## Zombie-Modell einrichten

Das animierte Zombie-Modell hat 12 Animationen und 3 Hautvarianten. Seine Lizenz erlaubt die Nutzung im Spiel,
aber kein erneutes Hochladen. Außerdem verlangt CGTrader angemessene Maßnahmen, damit Spieler das Modell nicht als
Datei herausholen können. Das Spiel lädt es deshalb nur aus einem verschlüsselten Paket (ChaCha20), das es erst im
Arbeitsspeicher öffnet. Weder das Modell noch das Paket noch der Schlüssel liegen im Repo, du richtest es so ein:

1. **Herunterladen:** „Zombie free VR / AR / low-poly“ von dremorn, kostenlos auf CGTrader (Konto nötig):
   <https://www.cgtrader.com/free-3d-models/character/fantasy-character/zombie-79f78dd5-e3c9-44d2-a9e4-9530f9139426>
2. **Entpacken:** die Archive nach `images/net/`, sodass dort die Ordner `Base+mesh/`, `Texture+set+1/` bis
   `Texture+set+3/` und `Zombie+animation/` liegen.
3. **Texturen verkleinern** (braucht Python mit Pillow):

   ```bash
   python tools/zombie_textures.py        # schreibt images/net/build/*.webp
   ```

4. **Modell umwandeln:**
   - Den Webserver starten und <http://localhost:8080/tools/zombie_convert.html> öffnen.
   - Auf **„zombie.glb herunterladen“** klicken.
   - Die Datei als `images/net/build/zombie.glb` speichern.
5. **Verschlüsselt packen** (braucht Node.js 22 oder neuer):

   ```bash
   node tools/zombie_pack.mjs             # schreibt assets/models/zombie/zombie.pak und zombie.key
   ```

6. **Ausprobieren:** das Spiel mit Strg + F5 neu laden und den Modus „Zombies“ wählen.

Auf einen Webserver gehören nur `assets/models/zombie/zombie.pak` und `zombie.key`, nie die Einzeldateien aus
`images/net/build/`. Der Schlüssel wird bei jedem Packen neu gewürfelt, lade also immer beide Dateien zusammen hoch.

## Quellen, Lizenzen und Namensnennung

| Bestandteil | Herkunft und Lizenz | Im Repo |
|---|---|---|
| Three.js (`vendor/three/`) | © three.js authors, MIT | ja |
| Waffen-System, Hände, Gewehr, MP und Pistole (`src/weapons/`) | © 2026 mshumer, MIT (siehe `src/weapons/LICENSE`) | ja |
| Scharfschützengewehr, Sturmgewehr, Bullpup, Messer und Granate (`src/weapons/models/`) | eigene Code-Modelle, Entwürfe mit Gemini, danach überarbeitet | ja |
| Taiga-47 (`assets/models/weapons/ak_tripo.glb`) | eigene Generierung mit Tripo (Pro-Konto) | ja |
| Vintage 9 (`assets/models/weapons/pistol_meshy.glb`) | eigene Generierung mit Meshy (bezahlter Tarif, Rechte beim Ersteller) | ja |
| Gelände, Gebäude, Hausnummern, Luftbild und Baumhöhen (`assets/nrw/`) | Geobasis NRW, [Datenlizenz Deutschland – Zero – 2.0](https://www.govdata.de/dl-de/zero-2-0) | ja |
| Texturiertes 3D-Mesh von Much (`assets/nrw/much/mesh/`, nur zum Ausprobieren) | Geobasis NRW, 3D-Mesh 2025, Datenlizenz Deutschland – Zero – 2.0 | noch nicht |
| Straßen und Wege (`assets/osm/`) | © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), ODbL 1.0 | ja |
| Soldaten-Figur (`assets/models/soldier/Soldier.glb`) | aus den three.js-Beispielen, ursprünglich Mixamo (Adobe); nur im Spiel, nicht einzeln zum Download | ja |
| Besen-Flieger (`assets/models/soldier/SoldierBesen.glb`, Quelle `blender/`) | dieselbe Soldaten-Figur, dazu Besen, Schild und Flug-Animationen in Blender ergänzt | ja |
| Minigun am Besen (in `SoldierBesen.glb`) | „[M134 handheld (Minigun)](https://sketchfab.com/3d-models/m134-handheld-minigun-8f008c3e18934707a834cde8c72364f5)“ von [Alexander_Borisevich](https://sketchfab.com/boriseviav), [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/); Hinweis im Spiel unter „Credits & Lizenzen“ (`credits.html`) | ja |
| Spielmusik (`audio/hauptspiel.wav`) | Ausschnitt aus „Del Rio Bravo“ von Kevin MacLeod, CC BY 3.0 (Hinweis siehe unten) | ja |
| Menümusik (`audio/astronaut12-…-301131.mp3`) | „Energy Gaming Electro Trap …“ von astronaut12, Pixabay Content License | ja |
| Sprung-Sound (`assets/audio/jump.mp3`) | Pixabay Content License | ja |
| Fluggeräusch des Besens (`audio/blow.mp3`), Nachladen (`audio/reload.mp3`), Leer-Klick (`audio/empty1.mp3`) | Pixabay Content License | ja |
| Soundeffekte (`audio/free/`, `audio/sfx/`) | freesound.org, CC0, plus eigene Synthese; Liste mit Links in `audio/free/text.md` und `audio/sfx/QUELLEN.txt` | ja |
| Flugbesen in der Hand (`ui/besen.webp`) | eigenes Bild, erstellt mit Gemini (Google) | ja |
| Waffenbilder der Waffenkammer (`ui/armory/`) | aus den Waffenmodellen des Spiels gerendert | ja |
| Fassadenfotos in Much (`assets/nrw/much/fronts/`) | eigene Fotos und Videos vom Gehweg aus, entzerrt mit `tools/rectify_fronts.py` | ja |
| Mehrspieler (`server/`, Client `vendor/colyseus/colyseus.esm.js`, ESM-Build von esm.sh) | Colyseus, MIT | ja |
| Zombie-Modell | „Zombie free VR / AR / low-poly“ von dremorn (CGTrader), Royalty Free License | nein, selbst laden |

**Musik:** „Del Rio Bravo“ Kevin MacLeod ([incompetech.com](https://incompetech.com/)),
Licensed under Creative Commons: By Attribution 3.0, <https://creativecommons.org/licenses/by/3.0/>

**Kartendaten:** Die Hinweise zu Geobasis NRW und OpenStreetMap blendet das Spiel auf den Karten selbst ein.

## Hinweise

- **Echte Orte und Läden:** Much und seine Geschäfte gibt es wirklich.
  - Die Ladenfronten sind gezeichnete Nachbildungen oder eigene Fotos vom Gehweg aus. Namen und Schriftzüge
    erscheinen nur als Teil des Straßenbilds, damit man die Orte wiedererkennt.
  - Es besteht keine Zusammenarbeit mit den Geschäften, der Gemeinde Much oder der Kreissparkasse. Niemand hat das
    Projekt beauftragt, gefördert oder bezahlt.
  - Marken und Logos gehören ihren Inhabern. Wer als Geschäft nicht im Spiel erscheinen möchte, meldet sich bitte
    über ein GitHub-Issue, dann nehme ich die Front heraus.
- **Keine fremden Fotos:** Fassaden und Schilder sind aus Code gezeichnet oder stammen aus eigenen Aufnahmen.
  Street-View-Bilder dienten nur als Vorlage und sind nicht im Spiel.
- **Erfundene Waffennamen:** Die Bauweise orientiert sich an echten Waffentypen, bildet aber kein bestimmtes
  Markenprodukt nach.
- **Kein Bezug zu Call of Duty:** Der Name ist ein Wortspiel. Das Spiel hat nichts mit Activision oder
  „Call of Duty“ zu tun.

## Lizenz

Für den eigenen Code dieses Projekts ist noch keine Open-Source-Lizenz festgelegt. Fremde Bestandteile stehen
unter den Lizenzen in der Tabelle oben.
