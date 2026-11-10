# Lektion 01 – Vorbereitung

**Lernziel:** Du rufst ein Sprachmodell aus TypeScript auf, bindest es in eine Chat-Oberfläche (Open WebUI) ein und siehst in Burp, was dabei wirklich über die Leitung geht. Danach steht die Umgebung für alle weiteren Lektionen.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
|---|---|---|---|---|
| 1 | `01-hello-llm.ts` | `npm run l01:1` | Prompt senden, Antwort Token für Token streamen | LM Studio |
| 2 | `02-open-webui.ts` | `npm run l01:2` | Programm als Modell `lesson-01-part-2` in Open WebUI anbieten (Fassade) | LM Studio, Open WebUI |
| 3 | `03-burp-proxy.ts` | `npm run l01:3` | Anfragen und Antworten in der HTTP-History von Burp lesen (Modell `lesson-01-part-3`) | LM Studio, Open WebUI, Burp |

**Reihenfolge:** Starte mit Teil 1 und arbeite die Teile der Reihe nach durch; jeder baut auf dem vorigen auf. Burp ist optional, solange `BURP_PROXY_URL` leer ist (ohne Burp: Eintrag in `.env` leeren). Ist sie gesetzt, muss Burp laufen (Intercept aus).

Einrichtung (Node, LM Studio, `.env`, Open WebUI, Burp): siehe das [Haupt-README](../../README.md). Infrastruktur: [`lessons/shared/README.md`](../shared/README.md).
