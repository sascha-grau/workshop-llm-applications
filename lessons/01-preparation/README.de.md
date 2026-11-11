# Lektion 01 – Vorbereitung

[English](README.md)

**Lernziel:** Du rufst ein Sprachmodell aus TypeScript auf, bindest es in eine Chat-Oberfläche (Open WebUI) ein und siehst in Burp, was dabei wirklich über die Leitung geht. Danach steht die Umgebung für alle weiteren Lektionen.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
| --- | --- | --- | --- | --- |
| 1 | `01-hello-llm.ts` | `npm run l01:1` | Prompt senden, Antwort Token für Token streamen | LM Studio |
| 2 | `02-open-webui.ts` | `npm run l01:2` | Programm als Modell `lesson-01-part-2` in Open WebUI anbieten (Fassade) | LM Studio, Open WebUI |
| 3 | `03-burp-proxy.ts` | `npm run l01:3` | Anfragen und Antworten in der HTTP-History von Burp lesen (Modell `lesson-01-part-3`) | LM Studio, Open WebUI, Burp |

**Reihenfolge:** Starte mit Teil 1 und arbeite die Teile der Reihe nach durch; jeder baut auf dem vorigen auf. `BURP_PROXY_URL` ist in `.env.example` leer, Burp ist also optional. Für Teil 3 trägst du in `.env` `BURP_PROXY_URL=http://localhost:8080` ein (der Standard-Listener von Burp). Ist die Adresse gesetzt, muss Burp laufen (Intercept aus); ohne Burp lässt du sie leer.

Einrichtung (Node, LM Studio, `.env`, Open WebUI, Burp): siehe das [Haupt-README](../../README.de.md). Infrastruktur: [`lessons/shared/README.de.md`](../shared/README.de.md).

## Grundbegriffe

- **Token:** ein Wortstück (ca. 3-4 Zeichen); das Modell liest und erzeugt Text Token für Token.
- **Streaming:** Die Antwort kommt stückweise statt am Ende auf einmal.
- **`temperature`:** steuert, wie zufällig die Wortwahl ist; 0 heißt so wiederholbar wie möglich.
- **Ollama-API-Fassade:** ein kleiner Server (Port `FACADE_PORT`), der sich wie Ollama verhält und jede Chat-Nachricht an dein Programm weiterreicht, sodass das Programm in Open WebUI als Modell erscheint.
- **Proxy (Burp):** sitzt zwischen Programm und Server und zeigt jede HTTP-Anfrage; die HTTP-History zeigt auch den Header `Authorization: Bearer ...`, also den API-Schlüssel im Klartext. Schwärze ihn, bevor du Screenshots oder Projektdateien teilst.

## Aufgaben

Die Aufgaben stehen auch am Anfang jeder Datei; maßgeblich sind die Dateiköpfe.

### Teil 1 – `01-hello-llm.ts`

1. Ändere die Frage in `model.stream(...)` und starte neu.
2. Setze beim ChatOpenAI-Objekt `temperature: 1.5` und frage mehrmals dasselbe. Was ändert sich? (`temperature` steuert, wie zufällig die Wortwahl ist; 0 = möglichst gleichbleibend.)
3. Ersetze `model.stream` durch `await model.invoke(...)` und gib `.text` aus. Wann siehst du die Antwort?

### Teil 2 – `02-open-webui.ts`

1. Starte das Programm, wähle "lesson-01-part-2" in Open WebUI und stelle eine Frage.
2. Ändere `ADVERTISED_MODEL` und lade Open WebUI neu. Wie heißt das Modell jetzt?
3. Füge in `postApiChat` ein `console.log(chatRequest.messages)` ein. Was schickt Open WebUI alles mit? (Open WebUI schickt zusätzlich eigene Hilfsanfragen für Titel und Tags; sie beginnen mit `### Task:`.)

### Teil 3 – `03-burp-proxy.ts`

1. Stelle in Open WebUI eine Frage und suche die Anfrage in der HTTP-History von Burp. Wo steht dein Text?
2. Schalte in Burp "Intercept on", ändere deine Frage in der Anfrage und leite sie weiter. Antwortet das Modell auf die geänderte Frage?
3. Streaming ausprobieren: Setze `disableStreaming` auf `false` und ersetze die zwei Zeilen im Handler durch den auskommentierten Block unter dem Handler. Wie sieht die Antwort in Burp jetzt aus?
