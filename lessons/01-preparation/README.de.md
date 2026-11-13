# Lektion 01 – Vorbereitung

[English](README.md) · Erklärungen, erwartete Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du rufst ein Sprachmodell aus TypeScript auf, bindest dein Programm als Modell in eine Chat-Oberfläche (Open WebUI) ein und siehst in Burp, was dabei wirklich über die Leitung geht. Danach steht die Umgebung für alle weiteren Lektionen.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-hello-llm.ts`](01-hello-llm.ts) | `npm run l01:1` | Prompt senden, Antwort Token für Token streamen | LM Studio mit Chat-Modell |
| 2 | [`02-open-webui.ts`](02-open-webui.ts) | `npm run l01:2` | Das Programm als Modell `lesson-01-part-2` in Open WebUI (Fassade) | wie Teil 1, dazu Open WebUI |
| 3 | [`03-burp-proxy.ts`](03-burp-proxy.ts) | `npm run l01:3` | Anfragen und Antworten in der HTTP-History von Burp (Modell `lesson-01-part-3`) | wie Teil 2, dazu Burp |

Die Aufgaben stehen im Kopf jeder Datei.

## Reihenfolge und Abhängigkeiten

- **Teil 1 → 3** der Reihe nach; jeder baut auf dem vorigen auf.
- **Teil 2 und 3** laufen, bis du sie mit Strg+C beendest. Beide belegen den Port der Fassade (`FACADE_PORT`), es läuft immer nur einer.
- **Burp** ist optional. Für Teil 3 trägst du `BURP_PROXY_URL` in `.env` ein; ist die Adresse gesetzt, muss Burp laufen (Intercept aus). Ohne Burp lässt du sie leer.
- **Einrichtung** (Node, LM Studio, `.env`, Open WebUI, Burp) steht in der [Wurzel-README](../../README.de.md#einrichtung), die Verbindung von Open WebUI zur Fassade unter [Open WebUI mit der Fassade verbinden](../../README.de.md#open-webui-mit-der-fassade-verbinden-ab-lektion-01-teil-2).

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Begriffe (Token, Streaming, Reasoning-Modell, Fassade, Proxy), Ablauf je Teil, echte Ausgabe, Stolperfallen
- [lessons/shared/README.de.md](../shared/README.de.md): die gemeinsamen Module (Fassade, Burp, Logging)
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss über alle Lektionen
- [docs/decisions.de.md](../../docs/decisions.de.md) und [docs/production.de.md](../../docs/production.de.md): Begründungen und Vereinfachungen
- [docs/trainer.de.md](../../docs/trainer.de.md) (für Trainer, enthält Lösungen): Vorbereitung, Zeiten
- Fehlermeldungen: [Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt) in der Wurzel-README

Zurück zur [Übersicht](../../README.de.md).
