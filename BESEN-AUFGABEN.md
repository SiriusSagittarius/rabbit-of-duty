# Aufgaben: Neues Flieger-Modell mit Besen, Moves, Energiebällen und Schild

Erstellt in Blender (Claude). Bitte alles der Reihe nach einbauen und danach im 2-Spieler-Modus testen.

## Neue Dateien (schon im Projekt)

- `assets/models/soldier/SoldierBesen.glb`: Soldat sitzt auf einem Hexenbesen. Der Besen ist fest im Modell (an der Hüfte).
  - Animationen: `Ride`, `Hover`, `LeanLeft`, `LeanRight`, `HoldTight`, `Roll`, `Boost` (Loops), `Trick`, `Spit`, `FidgetStretch`, `FidgetYawn`, `FidgetTap` (einmalig), außerdem weiterhin `Idle`, `Run`, `Walk`, `TPose`.
  - Objekt `Mund`: unsichtbarer Punkt vor dem Gesicht, bewegt sich mit dem Kopf (Startpunkt für Energiebälle).
  - Mesh `Schild`: Kugel um Reiter und Besen (für den Schutzschild).
- `src/shield.js`: fertiger Schild-Effekt (Shader mit Blitz-Adern, Fresnel-Rand, Treffer-Welle, Farbstufen). Benutzung steht oben in der Datei.
- `blender/SoldierBesen.blend`: Blender-Quelldatei (nur zum Bearbeiten, nicht laden).
- Die originale `assets/models/soldier/Soldier.glb` ist unverändert.

## 1. Modell austauschen

- Für die Mitflieger `SoldierBesen.glb` statt `Soldier.glb` laden.
- Die Zylinder-und-Kegel-Besen aus `decorateFlyer` (src/main.js, um Zeile 3069) entfernen, weil der Besen jetzt im Modell ist.
- Die Animationsauswahl (src/main.js, um Zeile 2964) umstellen: Beim Fliegen dauerhaft `Ride` als Loop statt `Idle`/`Run`.
- Das Mesh `Schild` beim Laden erst einmal unsichtbar machen (wird in Punkt 4 über `shield.js` gesteuert).

## 2. Flug-Moves (Loopings, Rollen, Spiralen)

- Die Bewegung macht der Code über die Rotation der ganzen Spielerfigur, nicht die Animation: Looping vorwärts/rückwärts, Fassrolle links/rechts, Spirale/Korkenzieher in jede Richtung.
  - Jeweils als zeitgesteuerte Kurve, ca. 1–1,5 s, mit Quaternions (keine Gimbal-Probleme), mit eigenen Tasten.
- Animationen dazu überblenden (`crossFadeTo`, ca. 0,2 s):
  - Looping → `HoldTight`
  - Rolle und Spirale → `Roll`
  - Kurven → `LeanLeft`/`LeanRight` je nach Lenkeinschlag, Gewicht nach Stärke
  - Sprint → `Boost`
  - Angeber-Taste → `Trick` (LoopOnce, danach zurück zu `Ride`)

## 2b. Stillstand (Schweben)

- Wenn der Spieler sich nicht bewegt: `Hover` als Loop statt `Ride` (sanftes Auf-und-ab-Wippen, Atmen, Beine baumeln, Umschauen). Beim Losfliegen per `crossFadeTo` (ca. 0,3 s) zurück zu `Ride`.
- Während `Hover` alle 8–15 s (zufällig) einen Fidget einmal abspielen (LoopOnce), danach zurück zu `Hover`: `FidgetStretch` (Strecken), `FidgetYawn` (Gähnen), `FidgetTap` (auf den Stiel klopfen). Sofort abbrechen, wenn der Spieler losfliegt.
- Fidgets auch übers Netzwerk schicken (Animationsname im Status reicht), damit der Mitspieler sie sieht.

## 3. Energiebälle spucken

- Taste zum Spucken: Animation `Spit` einmal abspielen (LoopOnce, danach zurück zu `Ride`).
- Eine leuchtende Energiekugel an der Weltposition von `Mund` starten: `model.getObjectByName('Mund').getWorldPosition(v)`. Flugrichtung = Blickrichtung des Spielers.

## 3b. Minigun am Besen

- Im Modell hängt unter dem vorderen Besenstiel eine Minigun (M134). Zwei Teile:
  - `Minigun`: Gehäuse (fest).
  - `Minigun_Laeufe`: Laufbündel, dreht sich über die fertige Animation **`MinigunSpin`** (Objekt-Animation, eine Umdrehung pro Loop, 9 Frames bei 24 fps). Im selben `AnimationMixer` wie der Reiter als Loop abspielen, parallel zur Reiter-Animation.
    - Wild drehen: `spinAction.timeScale` beim Feuern schnell auf ca. 4–6 hochfahren (Anlaufen ca. 0,3 s), beim Loslassen langsam auf 0 auslaufen lassen (ca. 1 s). Ohne Feuern steht sie bei `timeScale = 0`.
  - `Halterung`: zwei Metallschellen zwischen Stiel und Minigun (fest, nichts zu tun).
- **`Shoot`**: Reiter-Animation mit Rückstoß-Wackeln (Besen und Minigun zittern mit). Beim Dauerfeuer als Loop dazumischen (z. B. `Shoot` mit Gewicht 0.6 über `Ride`/`Hover`, oder per Crossfade).
- `Muendung`: Punkt vorne an der Laufspitze, Startpunkt für Kugeln und Mündungsfeuer (`getWorldPosition`).
- Schießen: Dauerfeuer bei gedrückter Taste, z. B. 15–20 Schuss/s, erst feuern, wenn die Läufe angelaufen sind. Dazu flackernder Mündungsblitz (Sprite/Licht an `Muendung`), Leuchtspur-Kugeln, Hülsen optional, Sound (Anlauf-Surren + Feuer). Schussrichtung = Blickrichtung des Spielers.
- Netzwerk: Feuern an/aus mitschicken, damit sich beim Mitspieler die Läufe drehen und das Mündungsfeuer zu sehen ist. Treffer wie bei den bestehenden Waffen.
- **Lizenz (Pflicht):** Das Modell steht unter CC-BY 4.0. In den Credits bzw. Impressum des Spiels muss stehen:
  "This work is based on "M134 handheld (Minigun)" (https://sketchfab.com/3d-models/m134-handheld-minigun-8f008c3e18934707a834cde8c72364f5) by Alexander_Borisevich (https://sketchfab.com/boriseviav) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)"

## 3c. Minigun-Update: größer, Mündungsbremse, glühende Läufe

`SoldierBesen.glb` wurde aktualisiert: Die Minigun ist 1,4× größer (ca. 1,24 m), hat eine dunkle Mündungsbremse (dreht mit den Läufen) und Kühlrippen. `Muendung` sitzt jetzt vor der Bremse, `MinigunSpin` funktioniert wie vorher.

**Glühende Läufe beim Dauerfeuer:**
- Die Läufe haben das eigene Material **`Lauf_Hitze`** (Textur wie vorher, Emission im Modell aus).
- Im Code einmal das Material holen (z. B. per `traverse` und `material.name === 'Lauf_Hitze'`) und für **jeden Flieger klonen** (`material.clone()`), damit nicht alle Spieler gleichzeitig glühen. Dann:
  ```js
  mat.emissive.setRGB(1.0, 0.32, 0.05);   // orange Glut
  // heat: 0..1, steigt beim Feuern (z. B. +0.35/s), fällt danach langsam (z. B. -0.2/s)
  mat.emissiveIntensity = heat * heat * 4;
  ```
- Optional ab `heat > 0.9` kurz Überhitzung: Feuerpause, Dampf- oder Rauchpartikel an `Muendung`.
- Netzwerk: `heat` muss nicht exakt übertragen werden. Der andere Client rechnet es aus „feuert ja/nein“ selbst mit.
- Das Schild (`Schild`) wurde nach vorne verlängert, damit die längere Waffe drin bleibt.

## 4. Schutzschild

- Pro Flieger `const shield = createShield(model)` aus `src/shield.js` aufrufen und jeden Frame `shield.update(dt)`. Standardmäßig `shield.setVisible(false)`.
- Eine Taste aktiviert das Schild, z. B. ein paar Sekunden mit Abklingzeit. Solange es aktiv ist, blockt es Treffer und ruft `shield.hit(trefferpunkt)` auf.
- Farbe: entweder `shield.setLevel(0–4)` (Blau, Türkis, Lila, Gold, Rot, z. B. für Upgrades) oder `shield.setEnergy(0–1)` (Schildenergie, sinkt bei Treffern; Farbe läuft von Blau zu Rot).

## 5. Netzwerk (wichtig: der Mitspieler muss alles sehen)

- Im normalen Status zusätzlich mitschicken: den aktuellen Animationsnamen, Schild an/aus und Schild-Stufe bzw. -Energie.
- Ereignisse als eigene Nachrichten:
  - `{ type: "move", move: "looping"|"roll"|"spiral"|"trick", dir, startTime }`: Der andere Client spielt dieselbe Kurve und Animation lokal ab und gleicht danach wieder mit der normalen Positions- und Rotationssynchronisierung ab.
  - `{ type: "spit", pos, dir }`: Der andere Client spielt `Spit` ab und zeigt den Energieball.
  - `{ type: "shieldHit", point }`: Der andere Client ruft `shield.hit(point)` auf.

## Tasten-Vorschlag (bitte an die bestehende Belegung anpassen)

- Q / E: Fassrolle links / rechts
- R / F: Looping vorwärts / rückwärts
- Z / C: Spirale links / rechts
- Shift: Boost
- T: Trick
- Rechte Maustaste oder V: Energieball spucken
- X: Schild

## 6. Ego-Sicht mit echten 3D-Armen (statt ui/besen.webp)

Die neue `SoldierBesen.glb` (27.11.) enthält einen Knoten **`Kamera_FP`** (Empty, hängt am Hüft-Knochen, sitzt knapp vor/über dem Kopf). Außerdem: Besenstiel ist länger (ragt jetzt über die ganze Gatling hinaus) und der Waffenkörper ist sauber zu den Läufen ausgerichtet – im Code muss dafür nichts geändert werden.

Bitte umsetzen:
1. Das 2D-Overlay `ui/besen.webp` in der Ego-Ansicht komplett entfernen (Element + CSS + Laden).
2. In der Ego-Ansicht die Spielerkamera jeden Frame auf die Weltposition von `Kamera_FP` setzen: `model.getObjectByName('Kamera_FP').getWorldPosition(camera.position)`. Blickrichtung weiter frei per Maus (Yaw/Pitch wie bisher), nur die Position kommt vom Knoten.
3. Nur beim **lokalen** Spieler den eigenen Kopf ausblenden: Knochen `mixamorigHead` auf `scale.set(0.001,0.001,0.001)` – nach `mixer.update()` jeden Frame setzen, sonst überschreibt die Animation es. Beim Wechsel zurück in die 3rd-Person wieder `scale.set(1,1,1)`.
4. Das eigene Modell in der Ego-Ansicht sichtbar lassen, damit man Arme, Handschuhe, Stiel und Gatling sieht. Den eigenen Schild in der Ego-Sicht ausblenden (`Schild.visible = false`), sonst sitzt die Kamera in der Kugel.
5. `camera.near = 0.05`, damit die Hände nicht abgeschnitten werden. FOV ca. 75–80.
6. Frustum-Culling für die Meshes des lokalen Spielers aus (`mesh.frustumCulled = false`), sonst flackern die Arme an den Bildrändern.

## 7. Neue Tricks: Winken, Handstand, Hinlegen, Tanzen (Stand 27.11.)

Neue Animationen in `SoldierBesen.glb` (jetzt 22 Stück):

| Clip | Länge (30 fps) | Was passiert |
|---|---|---|
| `Wave` | 42 Frames | sitzt, linke Hand am Stiel, winkt mit rechts zur Seite |
| `Handstand` | 80 Frames | hockt sich hin, Handstand auf dem Stiel, Beine wippen im Spagat, zurück in den Sitz |
| `LieDown` | 78 Frames | legt sich rücklings auf den Besen, Hände hinterm Kopf, Beine übereinander, wippt mit dem Fuß |
| `Dance` | 80 Frames | steht auf dem Stiel, Disco-Arme links/rechts im Takt, Hüftschwung, am Ende beide Arme hoch |

Alle Clips beginnen und enden in der `Ride`-Haltung.

Bitte umsetzen:
1. Clips einmal abspielen (`THREE.LoopOnce`, `clampWhenFinished = false`), mit `crossFadeTo` ca. 0,25 s rein und am Ende zurück zu `Ride`/`Hover`. Wie beim bestehenden `Trick`.
2. Tasten (vorher prüfen, ob sie frei sind): **L = Winken, H = Handstand, J = Hinlegen, K = Tanzen**. Auf dem Handy als zusätzliche Knöpfe im Trick-Menü. In die Hilfe-/Guide-Texte aufnehmen.
3. Während `Handstand`, `LieDown` und `Dance` in der Ego-Sicht automatisch kurz in die 3rd-Person-Kamera wechseln und danach zurück. Sonst hängt die Kamera irgendwo im Körper.
4. Im Mehrspieler den Clip-Namen wie bei den anderen Moves mitschicken, damit die anderen den Trick sehen.
5. Wichtige Änderung im Modell: Besen, Minigun, Halterung, Mündung, Schild und `Kamera_FP` hängen jetzt an einem eigenen Knochen **`Besen_Knochen`** statt an `mixamorigHips`. Bei allen alten Animationen macht er genau dasselbe wie die Hüfte. Bei den Tricks bleibt der Besen dadurch still, während der Körper turnt. Falls irgendwo im Code der Besen über die Hüfte gesucht wird, auf `Besen_Knochen` umstellen.
6. Die Schild-Kugel im Modell ist größer und runder geworden (mehr Luft um Reiter, Besen und Gatling). Im Code nichts ändern, nur prüfen, dass `shield.js` die Kugel nicht noch extra skaliert.

## 8. Zweite Spielfigur: die Hexe (Stand 27.11.)

Neue Datei im Projekt: **`assets/models/hexe/HexeBesen.glb`** (9,5 MB).

Das Modell ist absichtlich so gebaut, dass **der komplette bestehende Code weiterläuft**: alle
Objekt- und Clipnamen sind identisch mit `SoldierBesen.glb`.

| | Soldat | Hexe |
|---|---|---|
| Datei | `assets/models/soldier/SoldierBesen.glb` | `assets/models/hexe/HexeBesen.glb` |
| Knochen | 50 (mit Fingern) | 21 (**ohne** Fingerknochen) |
| Animationen | 22 | 22, gleiche Namen |
| Sitz | rittlings | **Damensitz**, beide Beine auf einer Seite |
| Waffe | M134 | andere Gatling (gleiche Objektnamen) |
| Besen | Zylinder | eigener Besen mit Borsten |

Gleich geblieben und per Name auffindbar:
`Besen_Knochen`, `Besen`, `Minigun`, `Minigun_Laeufe`, `Halterung`, `Muendung`, `Schild`,
`Kamera_FP`, `Mund`, sowie `mixamorigHips`, `mixamorigSpine/1/2`, `mixamorigNeck`, `mixamorigHead`,
`mixamorigLeft/RightShoulder|Arm|ForeArm|Hand`, `mixamorigLeft/RightUpLeg|Leg|Foot`.

Clips (beide Figuren): `Ride, Hover, LeanLeft, LeanRight, HoldTight, Boost, Roll, Trick, Shoot,
Spit, Wave, Dance, Idle, FidgetStretch, FidgetTap, FidgetYawn, LieDown, Handstand, Walk, Run,
TPose, MinigunSpin`.

Wichtige Positionen im Modell (glTF, Y oben, Meter, relativ zum Modell-Ursprung):

| Knoten | Soldat | Hexe |
|---|---|---|
| `Besen_Knochen` | (0.00, 1.061, -0.01) | (-0.09, 0.987, 0.02) |
| `Kamera_FP` | (0.00, 1.520, -0.40) | (-0.04, 1.655, 0.06) |
| `Muendung` | (0.00, 1.113, -1.786) | (-0.02, 0.927, -1.187) |

Die Besenachse liegt bei beiden auf derselben Linie und mit demselben Nickwinkel (12,9° Nase hoch),
die Hexe ist also flugtechnisch austauschbar. **Mündung und FP-Kamera bitte immer aus dem Knoten
auslesen, nicht hart kodieren** – die Gatling der Hexe ist kürzer, die Mündung sitzt 60 cm weiter hinten.

### Bitte umsetzen

1. **Figur auswählbar machen.** Ein Charakter-Objekt einführen, z. B.
   `const CHARACTERS = { soldat: {name:'Soldat', glb:'assets/models/soldier/SoldierBesen.glb'},
   hexe: {name:'Hexe', glb:'assets/models/hexe/HexeBesen.glb'} }`.
   Das Laden des Spielermodells auf diesen Eintrag umstellen, statt den Pfad fest zu verdrahten.
   Auswahl in `localStorage` merken.
2. **Auswahl-UI** vor dem Start (und später im Menü umschaltbar): zwei Kacheln mit Namen und Bild.
   Bild für die Hexe: `ui/armory/hexe.webp` (lege ich noch dazu).
3. **Beide Modelle vorladen** oder beim Umschalten sauber austauschen: altes Modell aus der Szene
   nehmen, Mixer und alle Knoten-Referenzen (Besen_Knochen, Muendung, Schild, Kamera_FP, Mund)
   neu auflösen. Kein Zustand aus dem alten Modell weiterverwenden.
4. **Netzwerk:** die gewählte Figur mitschicken (z. B. Feld `char: 'hexe'` beim Join und in den
   Spielerdaten), damit Mitspieler die richtige Figur sehen. Unbekannter Wert → Soldat.
5. **Fingerknochen absichern.** Die Hexe hat keine. Überall, wo auf `mixamorigLeftHand*` /
   `mixamorigRightHand*` (Index/Middle/Pinky/Ring/Thumb) zugegriffen wird, auf `null` prüfen
   statt anzunehmen, dass es sie gibt.
6. **Ego-Sicht:** funktioniert unverändert (Kamera auf `Kamera_FP`, eigener `mixamorigHead` auf
   `scale 0.001`, eigenen `Schild` ausblenden). Bei der Hexe hängen **Hut und Haare am Kopfknochen**,
   die verschwinden also automatisch mit. Bitte einmal gegenprüfen, dass in der Ego-Sicht keine
   Haarsträhne mehr im Bild hängt.
7. **Schild:** die Kugel der Hexe ist eine Ellipse 0,95 × 1,50 × 0,95 m, auf sie zentriert.
   In `shield.js` nichts skalieren, nur den Knoten verwenden.
8. **Trefferzone/Kollision:** falls die Hitbox aus dem Soldaten-Modell abgeleitet wird, für die
   Hexe aus deren Bounding-Box neu berechnen (sie ist durch den Rock deutlich breiter als er).

### Noch nicht gemacht (kann später kommen)
- Keine eigenen Finger-/Rockknochen: der Rock bewegt sich starr mit der Hüfte. Wenn der Rock im
  Flug wehen soll, sag Bescheid, dann baue ich 3–4 Rockknochen mit Nachschwingen ein.
- `Walk` und `Run` sind bei der Hexe Kopien von `Ride`/`Hover` – sie läuft ja nie.
