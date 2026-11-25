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
