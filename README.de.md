# Workshop: LLM-Anwendungen selbst bauen

[English](README.md)

In diesem Workshop baust du in acht Lektionen mit mehreren kleinen Teilen eine LLM-Anwendung nach: vom ersten Aufruf eines Sprachmodells über einen Chat in Open WebUI, Werkzeugaufrufe, Embeddings und Retrieval-Strategien bis zu einer Suche mit Quellenangaben (RAG) über die OWASP Top 10 für LLM-Anwendungen; zum Schluss misst du, wie gut Suche und Antworten sind. Dabei schaust du mit Burp Suite jeder Anfrage zu, die dein Programm an das Modell schickt. Du brauchst etwas JavaScript, aber kein TypeScript-Wissen und keine Erfahrung mit LLM-Schnittstellen. Jeder Teil einer Lektion ist eine Datei, die mit einem Lernziel und einer Aufgabe beginnt.

> **Inspiration und Dank:** Dieser Workshop ist stark vom heise-conferences-Workshop [KI mit eigenen Daten richtig umsetzen: RAG, Embeddings und Retrieval-Architekturen bewerten und anwenden](https://heise-conferences.de/workshop/ki-mit-eigenen-daten-richtig-umsetzen-rag-embeddings-und-retrieval-architekturen-bewerten-und-anwenden-UJS49IRR2iSa5D) inspiriert. Ein besonderer Dank geht an den Trainer Gregor Biswanger: [YouTube](https://youtube.com/GregorBiswanger) · [LinkedIn](https://www.linkedin.com/pub/gregor-biswanger/11/420/513).

## Konventionen

Die Dokumentation gibt es auf Englisch (README.md) und Deutsch (README.de.md). Code-Kommentare sowie Lernziel und Aufgabe am Anfang jeder Lektionsdatei sind deutsch. Bezeichner, Felder und Log- und Fehlermeldungen sind englisch, wie im Code üblich. Prompts an das Modell und Chat-Antworten in Open WebUI sind deutsch, weil das Quellmaterial (die deutsche OWASP-Ausgabe) deutsch ist. Fehlermeldungen in der Fehlersuche unten stehen im englischen Originalwortlaut. Die Aufgaben stehen nur in den Dateiköpfen der Lektionsdateien; die Lektions-READMEs geben den Überblick über die Teile, die Guides erklären Ablauf und Ausgabe. Hinweise zur Chat-Sprache stehen nur in den englischen Lektionsdokumenten (`README.md`, `GUIDE.md`).

**TypeScript in fünf Zeilen:** Die Dateien sind TypeScript, du liest sie wie JavaScript mit ein paar Zusätzen.

- `: string` und Angaben in `<…>` sind Typ-Annotationen. Beim Lesen kannst du sie ignorieren.
- Ein `!` hinter einem Ausdruck heißt: "ist garantiert nicht `undefined`".
- `as const`, `type …` und `import type` ändern zur Laufzeit nichts.
- `keyof typeof X` heißt: "einer der Schlüssel von X".
- Node führt die Dateien direkt aus und entfernt die Typen dabei einfach.

## Dokumentation

| Dokument | Für wen | Inhalt |
|---|---|---|
| `GUIDE.de.md` je Lektion (Lektionsordner) | Teilnehmende | Idee, Ablauf, erwartete Ausgabe, Stolperfallen eines Teils |
| [docs/architecture.de.md](docs/architecture.de.md) | Alle | Datenfluss zwischen den Lektionen, Artefakte, Verträge, bekannte Grenzen |
| [docs/decisions.de.md](docs/decisions.de.md) | Alle | Begründete Entscheidungen |
| [docs/production.de.md](docs/production.de.md) | Alle | Vereinfachungen gegenüber Produktion, Literatur |
| [docs/trainer.de.md](docs/trainer.de.md) | Trainer, enthält Lösungen | Vorbereitung, Zeiten, Lösungen, Stolperfallen |
| [docs/conventions.de.md](docs/conventions.de.md) | Autorinnen und Autoren | Wo welche Information steht, Regeln für Kommentare und Guides |

## Voraussetzungen

### Werkzeuge

| Werkzeug | Wozu | Link |
| --- | --- | --- |
| Node.js 22.19 oder neuer | Führt die TypeScript-Dateien direkt aus, es gibt keinen Build-Schritt (`engines` in `package.json`). | [nodejs.org/en/download](https://nodejs.org/en/download) |
| LM Studio | Lokaler Server für Chat- und Embedding-Modelle mit OpenAI-kompatibler Schnittstelle, Standardadresse `http://localhost:1234/v1`. | [lmstudio.ai](https://lmstudio.ai) · [Server](https://lmstudio.ai/docs/developer/core/server) · [OpenAI-Kompatibilität](https://lmstudio.ai/docs/developer/openai-compat) · [Embeddings](https://lmstudio.ai/docs/developer/openai-compat/embeddings) · [CLI `lms`](https://lmstudio.ai/docs/cli) |
| Burp Suite Community | Ab Lektion 01, Teil 3: zeigt jede HTTP-Anfrage. Optional: ohne Burp lässt du `BURP_PROXY_URL` in `.env` leer (siehe Einrichtung). | [Download](https://portswigger.net/burp/communitydownload) · [CA-Zertifikat](https://portswigger.net/burp/documentation/desktop/external-browser-config/certificate) |
| Open WebUI | Ab Lektion 01, Teil 2: Chat-Oberfläche für die Teile mit Chat (Lektion 01 ab Teil 2, Lektion 02 und 07). | [openwebui.com](https://openwebui.com) · [Quick Start (Docker)](https://docs.openwebui.com/getting-started/quick-start/) |
| Qdrant | Vektordatenbank mit Volltextsuche, ab Lektion 06 (und Lektion 07, Teil 8 bis 11). Läuft als Docker-Container, siehe Qdrant einrichten. | [qdrant.tech](https://qdrant.tech) · [Quick Start](https://qdrant.tech/documentation/quickstart/) |
| Docker | Nötig für Qdrant (Lektion 06, Lektion 07 Teil 8 bis 11) und optional, um Open WebUI als Container zu starten. | [Docker Desktop](https://docs.docker.com/get-started/get-docker/) · [Docker Engine (Linux)](https://docs.docker.com/engine/install/) |
| VS Code | Empfohlen: F5 und Code Runner sind vorbereitet, es geht aber auch ohne. | [code.visualstudio.com](https://code.visualstudio.com) · [Code Runner](https://marketplace.visualstudio.com/items?itemName=formulahendry.code-runner) |

Burp ist optional: Ist `BURP_PROXY_URL` leer, laufen die Programme direkt ohne Burp. Ist sie gesetzt, muss Burp laufen (Intercept aus). Für Lektion 02, Teil 2 braucht Node dann außerdem Burps CA-Zertifikat (`BURP_CA_CERT`, siehe Fehlersuche unten).

### Burp einrichten

Das brauchst du erst ab Lektion 01, Teil 3. Eine ausführliche Anleitung gibt es [bei PortSwigger](https://portswigger.net/burp/documentation/desktop/getting-started), hier die Schritte, die du brauchst:

1. Starte Burp und wähle "Temporary project" und "Use Burp defaults".
2. Der Proxy lauscht standardmäßig auf `127.0.0.1:8080` (Proxy, Proxy settings). Das ist der Wert, den du in `BURP_PROXY_URL` einträgst (`http://localhost:8080`; standardmäßig ist sie leer).
3. Unter Proxy, HTTP history siehst du jede Anfrage, die dein Programm schickt.
4. Unter Proxy, Intercept schaltest du "Intercept is on/off". Ist es an, hält Burp jede Anfrage fest, bis du auf "Forward" klickst. Open WebUI schickt pro Nachricht mehrere Anfragen: Leite alle mit "Forward" weiter und schalte Intercept danach wieder aus.

Achtung: Burps History zeigt den Header `Authorization: Bearer …`, also den API-Schlüssel im Klartext. Teile keine Burp-Screenshots oder Projektdateien, ohne ihn vorher zu schwärzen.

### Modelle

Alle Modelle laufen in LM Studio auf einem Server. Die Tabelle nennt die Modellkarte, ein GGUF-Paket für LM Studio (GGUF ist das Dateiformat der Modelle) und die Lizenz.

| Modell | Wofür | Modellkarte | GGUF | Lizenz |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B (Q4_K_M) | Chat-Modell, Lektion 01 bis 02, Lektion 04 Teil 4, Lektion 06 Teil 5 bis 7, Lektion 07 und Lektion 08 Teil 2, 3, 5 und 6 | [lmstudio-community/Qwen3.5-4B-GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF) | [lmstudio-community](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF) | Apache-2.0 |
| multilingual-e5-base (Q8_0) | Embedding-Modell, Lektion 03 bis 08 | [dinab/multilingual-e5-base-Q8_0-GGUF](https://huggingface.co/dinab/multilingual-e5-base-Q8_0-GGUF) | [dinab (Community)](https://huggingface.co/dinab/multilingual-e5-base-Q8_0-GGUF) | MIT |
| EmbeddingGemma 300m (QAT Q4_0) | Vergleichsmodell, nur Lektion 03, Teil 2 und 3 | [lmstudio-community/embeddinggemma-300m-qat-GGUF](https://huggingface.co/lmstudio-community/embeddinggemma-300m-qat-GGUF) | [lmstudio-community](https://huggingface.co/lmstudio-community/embeddinggemma-300m-qat-GGUF) | Gemma-Nutzungsbedingungen |

`Q4_K_M`, `Q8_0` und `QAT Q4_0` benennen, wie stark ein Modell komprimiert (quantisiert) ist: Die Zahl ist grob die Bit-Zahl pro Gewicht, `Q4` ist also kleiner und etwas ungenauer als `Q8`; QAT heißt, das Modell wurde schon mit Blick auf die Kompression trainiert und verliert dadurch weniger Qualität.

Die Original-Modellkarte von EmbeddingGemma ([google/embeddinggemma-300m](https://huggingface.co/google/embeddinggemma-300m)) ist gesperrt (gated): Du musst dich bei Hugging Face anmelden und die Bedingungen akzeptieren. Das GGUF in der Tabelle ist nicht gesperrt, du kannst es direkt laden. Das GGUF von E5 stammt von einem Community-Konto (dinab), nicht von den Autoren des Modells: Es ist eine Umwandlung von [intfloat/multilingual-e5-base](https://huggingface.co/intfloat/multilingual-e5-base). Das GGUF von Qwen stammt von lmstudio-community, es ist eine Umwandlung von [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B).

### LM Studio einrichten

1. Installiere LM Studio und lade die drei Modelle aus der Tabelle herunter (in der App über die Suche, oder mit `lms get`). Wer nur Lektion 01 und 02 macht, braucht nur das Chat-Modell.
2. Lade die Modelle (Chat-Modell, E5 und, für Lektion 03, Teil 2 und 3, EmbeddingGemma) in LM Studio. Im Developer-Tab siehst du für jedes geladene Modell einen Identifier. Lade das Chat-Modell mit **Max Concurrent Predictions = 1** (Ladeeinstellungen, erweiterte Ansicht) oder mit `lms load <identifier> --parallel 1`. Der Standard ist 4; die parallelen Plätze teilen sich den Kontext, und Lektion 08, Teil 5 meldet dann `Context size has been exceeded`. Mit 1 reicht ein Kontext von 8192. Den Kontext stattdessen zu verdoppeln, scheiterte in der Generalprobe am Grafikspeicher.
3. Starte den Server im Developer-Tab (oder mit `lms server start`). Er lauscht auf Port 1234, die Adresse ist `http://localhost:1234/v1`.
4. Trage die Identifier in `.env` ein (siehe Einrichtung). Schreibe sie genau so, wie LM Studio sie anzeigt (Developer-Tab oder `lms ls`). Die Werte in `.env.example` sind die üblichen LM-Studio-Identifier und passen vielleicht nicht zu deinen (siehe unten).

Die Modellnamen in `.env.example` sind die Identifier, die LM Studio in der Generalprobe zeigte (`qwen3.5-4b`, `text-embedding-multilingual-e5-base`, `text-embedding-embeddinggemma-300m-qat`). Weicht deiner ab, kopiere den Identifier, den LM Studio für das geladene Modell zeigt: mit `lms ps` ([Doku](https://lmstudio.ai/docs/cli/local-models/ps)), mit `lms ls` ([Doku](https://lmstudio.ai/docs/cli/local-models/ls)) oder aus `GET /v1/models` ([Doku](https://lmstudio.ai/docs/developer/openai-compat/models)). LM Studio lädt Modelle standardmäßig bei der ersten Anfrage selbst nach (JIT-Laden, siehe [TTL und Auto-Evict](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict)). Die erste Antwort dauert dann länger, und das Modell erscheint erst danach in `lms ps`.

Ein anderer OpenAI-kompatibler Server geht auch, solange er Chat und Embeddings unter derselben Adresse anbietet.

**Kostenhinweis bei bezahlten APIs:** Die Programme setzen kein `maxTokens`, ein bezahlter Anbieter berechnet also jede Länge, die das Modell erzeugt, und das Reranking (Lektion 06, Teil 5; Lektion 07, Teil 9) schickt pro Frage mehrere Chat-Anfragen parallel. Auf einem lokalen Server kostet das nichts, bei einer bezahlten API schon: Setze vorher ein Ausgabenlimit.

### Hardware

Die Zahlen sind Faustregeln. Rechne mit Arbeitsspeicher (RAM, bei Grafikkarte VRAM) etwa in Höhe der Dateigröße plus etwas Platz für den Kontext.

| Modell | Dateigröße | RAM-Bedarf (Faustregel) |
| --- | --- | --- |
| Qwen3.5-4B (Q4_K_M) | 2,71 GB | etwa 4 bis 6 GB |
| multilingual-e5-base (Q8_0) | 0,30 GB | unter 1 GB |
| EmbeddingGemma 300m (QAT Q4_0) | 0,23 GB | unter 1 GB |

Das Chat-Modell ist klein genug für die meisten Laptops. Kleine Modelle antworten allerdings schwächer, besonders bei Werkzeugaufrufen (Lektion 02, Teil 3 und 4).

### Qdrant einrichten

Ab Lektion 06 brauchst du ein laufendes Qdrant (eine Vektordatenbank). Starte es einmal als Docker-Container:

```bash
docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0
```

Das `127.0.0.1:` ist Absicht: Mit einem schlichten `-p 6333:6333` veröffentlicht Docker den Port auf allen Netzwerkschnittstellen und umgeht dabei die Firewall des Rechners. Dieses Qdrant hat keine Authentifizierung, andere im Workshop-WLAN könnten deine Collection lesen oder vergiften. Die Version ist festgelegt, weil sie zur Client-Version (1.20) passt; der BM25-Volltextindex aus Lektion 06 braucht ein aktuelles Qdrant. Später genügt `docker start qdrant`. Die Adresse steht als `QDRANT_URL` in `.env` (Standard `http://localhost:6333`).

### Open WebUI starten

Wenn du Open WebUI als Container betreibst, startet dieser Befehl es (unter Linux braucht der Container die Option `--add-host`, damit er deinen Rechner erreicht; unter macOS und Windows schadet sie nicht):

```bash
docker run -d --name open-webui -p 127.0.0.1:3000:8080 --add-host=host.docker.internal:host-gateway -v open-webui:/app/backend/data ghcr.io/open-webui/open-webui:v0.13.3
```

Öffne `http://localhost:3000` und lege beim ersten Anmelden das Admin-Konto an (das erste Konto wird zum Administrator; die Daten bleiben im Volume `open-webui` auf deinem Rechner). Port 3000 ist Absicht: Burps Standard-Listener belegt schon 8080 (siehe "Wenn etwas nicht klappt"). Später genügt `docker start open-webui`. Ohne Docker: `open-webui serve --port 3000` ([Quick Start](https://docs.openwebui.com/getting-started/quick-start/)). Die Version ist festgelegt, damit die Oberfläche zu dieser Anleitung passt; neuere Versionen können Menüpunkte verschieben.

### Variante: Trainer-Server

Wenn die Trainerin oder der Trainer LM Studio auf einem starken Rechner betreibt, brauchst du selbst keine Modelle. Der Trainer schaltet in LM Studio "Serve on Local Network" ein (oder startet `lms server start --bind 0.0.0.0`, siehe [Doku](https://lmstudio.ai/docs/developer/core/server/serve-on-network) und [Server-Einstellungen](https://lmstudio.ai/docs/developer/core/server/settings)). Du setzt in `.env` `REMOTE_MODEL_BASE_URL=http://<IP-des-Trainers>:1234/v1` und die Identifier, die der Trainer nennt. Nur der Modell-Server liegt dann beim Trainer. Die Fassade (`FACADE_HOST`, `FACADE_PORT`) und Burp laufen weiterhin auf deinem eigenen Rechner. Achtung: Der Server ist dann für alle im Netz erreichbar, und Prompts sowie ein API-Schlüssel laufen unverschlüsselt über HTTP. Nutze das nur in einem Netz, dem du vertraust, und beende die Freigabe nach dem Workshop.

## Einrichtung

Prüfe zuerst deine Node-Version, sie muss mindestens 22.19 sein:

```bash
node --version
```

Dann installierst du die Pakete und legst deine `.env` an:

```bash
npm ci
cp .env.example .env
```

`npm ci` installiert genau die Versionen aus `package-lock.json` und prüft deren Integrität. `npm install` brauchst du nur, wenn du Abhängigkeiten ändern willst.

Dann lädst du einmal den Tokenizer des E5-Modells (rund 16 MB, braucht Internet; danach läuft alles offline):

```bash
npm run tokenizer:fetch
```

Er landet in `.cache/tokenizers/`; kopiere den Ordner zu Teilnehmenden ohne Internet. Ohne ihn zählt `npm run l04:0` ersatzweise über den Modell-Server.

> **`npm audit`** meldet bekannte Funde über die Fassaden-Bibliothek. Führe nie `npm audit fix --force` aus; Details: [docs/decisions.de.md](docs/decisions.de.md#npm-audit-funde).

Unter Windows kopierst du die Vorlage so: `copy .env.example .env` (cmd) oder `Copy-Item .env.example .env` (PowerShell). Die Befehle in diesem README sind sonst für ein POSIX-Terminal geschrieben (Linux, macOS, Git Bash). `npm run …` funktioniert überall gleich.

Öffne danach `.env` und passe die Werte an deine Umgebung an: die Identifier der geladenen Modelle aus LM Studio, bei Bedarf die Adresse des Servers, den Burp-Port und den API-Schlüssel. Jeder Eintrag ist in `.env.example` erklärt. Die Datei `.env` ist in `.gitignore` und wird nicht eingecheckt.

**Mit und ohne Burp:** `BURP_PROXY_URL` ist in `.env.example` leer: kein Proxy, alle Programme verbinden direkt, und du brauchst auch kein `BURP_CA_CERT`. Für Lektion 01, Teil 3 schaltest du den Proxy selbst ein und setzt `BURP_PROXY_URL=http://localhost:8080`. Ist die Adresse gesetzt und Burp läuft nicht, brechen die Programme, die Burp nutzen (ab Lektion 01, Teil 3, außer `l04:0`), mit einer Burp-Meldung ab.

Die Einstellungen im Überblick:

| Schlüssel | Bedeutung |
| --- | --- |
| `REMOTE_MODEL_BASE_URL` | Adresse des Servers mit `/v1`, für Chat und Embeddings (LM Studio: `http://localhost:1234/v1`). |
| `REMOTE_MODEL_API_KEY` | Nur nötig, wenn der Server einen Schlüssel verlangt. LM Studio braucht keinen. |
| `REMOTE_MODEL_NAME` | Identifier des Chat-Modells aus LM Studio. |
| `SHOW_THINKING` | Optional: `true` behält die Denkschritte von Reasoning-Modellen in der Ausgabe (Konsole, Open WebUI als `<think>`-Block), statt sie wegzulassen. Leer oder `false` ist der Standard. Mit `true` scheitern JSON-Antworten in Lektion 04, 06, 07 und 08 (in Lektion 04 bekommt der Fragen-Index keine neuen Fragen), und die Auswertung in Lektion 08 wird unzuverlässig. Erlaubt: `true`/`false`, `1`/`0`, `yes`/`no`. |
| `REMOTE_EMBEDDING_MODEL_NAME` | Identifier des E5-Modells. |
| `REMOTE_EMBEDDING_GEMMA_MODEL_NAME` | Identifier von EmbeddingGemma, nur für Lektion 03, Teil 2 und 3. |
| `ALL_DOCUMENTS` | Optional: `true` zeigt die Detailausgabe von Lektion 04, Teil 1 bis 3 für alle Dokumente (nur die Ausgabe, nie der Index). Jeder Wert (`true` oder `false`) überschreibt die Konstante in `chunking.ts`; leer gilt die Konstante. |
| `BURP_PROXY_URL`, `BURP_CA_CERT` | Burp-Proxy und dessen Zertifikat. Optional: `BURP_PROXY_URL` ist standardmäßig leer (kein Proxy), setze sie für Lektion 01, Teil 3 auf `http://localhost:8080`. |
| `QDRANT_URL` | Adresse von Qdrant ab Lektion 06. Standard `http://localhost:6333`. |
| `FACADE_HOST`, `FACADE_PORT` | Wo die Ollama-Fassade lauscht. Lektion 08, Teil 6 (promptfoo) schickt seine Testfragen an diese Adresse. |

## Ein Programm starten

Der Workshop besteht aus acht Lektionen, jede mit mehreren Teilen. Jeder Teil ist eine Datei, die mit einem Kommentar beginnt, der Lernziel, Voraussetzungen, Startbefehl und Aufgabe nennt. Die Gesamt-Demos heißen `99-full-demo.ts`, damit sie die letzte Datei bleiben, wenn Teile hinzukommen; gestartet werden sie mit dem letzten npm-Skript der Lektion (`l05:5`, `l06:7`, `l07:11`). Es gibt drei Wege, sie zu starten:

| Weg | So geht's |
| --- | --- |
| npm-Skript | `npm run l01:1` (Lektion 01, Teil 1), `npm run l01:2` und so weiter. Die Skriptnamen stehen in der Übersicht unten. |
| VS Code, F5 | Datei öffnen und F5 drücken (`.vscode/launch.json`, Konfiguration "Run current file"). Hier kannst du Haltepunkte setzen. Das klappt nur für `.ts`-Dateien; ist `.env` oder eine YAML-Datei geöffnet, versucht Node diese Datei auszuführen und scheitert. Für die promptfoo-Konfigurationen von Lektion 08 (Teil 5 und 6) wähle unter "Ausführen und Debuggen" einmal die Konfiguration "promptfoo: current config" und drücke dann F5. |
| Code Runner | Erweiterung `formulahendry.code-runner` installieren (VS Code schlägt sie vor), dann die Datei mit dem Abspielknopf starten (`.vscode/settings.json`). |

Du musst nicht aus einem bestimmten Ordner starten: Alle Pfade werden vom Repo-Root aus aufgelöst (`lessons/shared/paths.ts`). Nur `.env` wird relativ zum Arbeitsverzeichnis geladen (npm-Skripte) bzw. vom Workspace-Ordner (VS Code). Starte die Skripte also im Repo-Root. Die Teile mit Chat laufen, bis du sie mit Strg+C beendest. `npm run typecheck` prüft die Typen, ist aber für die Lektionen nicht nötig.

## Open WebUI mit der Fassade verbinden (ab Lektion 01, Teil 2)

Das brauchst du erst ab Lektion 01, Teil 2, nach der Einrichtung. Die Teile mit Chat (Lektion 01 ab Teil 2, Lektion 02 und Lektion 07) starten einen kleinen Server, die Fassade. Sie verhält sich gegenüber Open WebUI wie ein Ollama-Server und reicht jede Chat-Nachricht an das Programm weiter. Standardmäßig lauscht sie auf `127.0.0.1:11435` (`FACADE_HOST`, `FACADE_PORT`). Nicht Ollamas Standardport 11434, damit ein echtes Ollama daneben laufen kann.

1. Starte den Teil. Im Log steht `Facade ready` mit der Adresse.
2. Öffne in Open WebUI den Administrationsbereich (Admin Panel), dann Einstellungen, dann Verbindungen ("Administrationsbereich → Einstellungen → Verbindungen", englisch Admin Panel → Settings → Connections), und füge eine **Ollama**-Verbindung mit der Adresse der Fassade hinzu, z. B. `http://127.0.0.1:11435`.
3. Der Teil erscheint als Modell (`lesson-01-part-2`, `lesson-01-part-3`, `lesson-02-part-1` bis `lesson-02-part-4`, `lesson-07-headings`, `lesson-07-semantic`, `lesson-07-questions` und so weiter; die vollständige Liste der Modellnamen steht in [`lessons/07-rag-open-webui/README.de.md`](lessons/07-rag-open-webui/README.de.md)). Wähle es im Chat aus.

Läuft Open WebUI in Docker, erreicht der Container `127.0.0.1` deines Rechners nicht. Setze dann in `.env` `FACADE_HOST=0.0.0.0` und trage in Open WebUI `http://host.docker.internal:11435` ein (Port wie `FACADE_PORT`; Podman: `host.containers.internal`). Unter Linux muss der Container dafür mit `--add-host=host.docker.internal:host-gateway` gestartet werden. Mit `0.0.0.0` ist die Fassade für alle im Netz erreichbar, und sie hat keine Authentifizierung: Nutze das nur in einem Netz, dem du vertraust. Unter Linux mit Docker geht es enger: Nimm statt `0.0.0.0` die IP der Docker-Bridge (meist `172.17.0.1`, zu sehen mit `ip addr show docker0`) als `FACADE_HOST`.

## Die Lektionen

Jede Lektion hat einen Ordner mit eigener `README.de.md`: Dort stehen Lernziel, die Teile mit Dateien und eine Reihenfolge. Dazu kommt je Lektion eine `GUIDE.de.md` mit Ablauf, erwarteter Ausgabe und Hilfe, wenn etwas hakt.

| Lektion | Teile und Skripte | Lernziel | Braucht |
| --- | --- | --- | --- |
| [01 – Vorbereitung](lessons/01-preparation/README.de.md) | Teil 1 `l01:1` (Hello LLM), Teil 2 `l01:2` (Open WebUI), Teil 3 `l01:3` (Burp) | Du schickst einen Prompt an ein Sprachmodell, setzt eine Chat-Oberfläche davor und siehst in Burp jede Anfrage. | LM Studio (Chat-Modell); ab Teil 2 Open WebUI; Teil 3 Burp |
| [02 – Tool-Calls](lessons/02-tool-calls/README.de.md) | Teil 1 `l02:1` (Wissen und Few-Shot), Teil 2 `l02:2` (Web-Scraping), Teil 3 `l02:3` (Tool-Calls von Hand), Teil 4 `l02:4` (Tool-Calls mit `createAgent`) | Du gibst dem Modell erst von Hand Wissen mit (Teil 1 und 2) und lässt es dann per Werkzeugaufruf selbst holen (Teil 3 und 4). | LM Studio (Chat-Modell), Open WebUI, Burp optional; Teil 2 Internet |
| [03 – Embeddings](lessons/03-embeddings/README.de.md) | Teil 1 `l03:1`, Teil 2 `l03:2`, Teil 3 `l03:3` | Du erzeugst Embeddings, vergleichst Texte mit der Kosinus-Ähnlichkeit und siehst, wozu die Präfixe `query: ` und `passage: ` dienen. | LM Studio (E5-Modell, ab Teil 2 auch EmbeddingGemma), Burp optional |
| [04 – Chunking](lessons/04-chunking/README.de.md) | Teil 0 `l04:0` (Chunks erzeugen), Teil 1 bis 4 `l04:1` bis `l04:4` (vier Arten zu schneiden und Indizes bauen), Teil 5 `l04:5` (Parent-Document) | Du zerlegst Dokumente in Chunks, die ins Token-Limit von E5 passen, baust daraus Indizes und siehst, wie die Art des Schneidens die Suche verändert. | LM Studio (E5-Modell, Teil 4 auch Chat-Modell), Burp optional; ab Teil 1 die Chunks aus Teil 0; Teil 5 den Index aus Teil 2 |
| [05 – Retrieval-Strategien](lessons/05-retrieval-strategies/README.de.md) | Teil 1 `l05:1` (Top-k), Teil 2 `l05:2` (MMR), Teil 3 `l05:3` (Metadaten-Filter), Teil 4 `l05:4` (Schwellenwert), Teil 5 `l05:5` (alles im Vergleich, mit Fragen-Set in `question-set.json`) | Du vergleichst vier Regeln, nach denen die Suche Chunks auswählt, siehst, warum Zugriffsrechte vor der Suche gefiltert werden, und prüfst den Schwellenwert an einem Satz Testfragen (Teil 5). | LM Studio (E5-Modell), Burp optional, Index aus Lektion 04, Teil 2; kein Chat-Modell, kein Open WebUI |
| [06 – Hybrid-Suche und Reranking](lessons/06-hybrid-rerank/README.de.md) | Teil 1 `l06:1` (Collection laden), Teil 2 `l06:2` (Keywords, BM25), Teil 3 `l06:3` (Vektorsuche), Teil 4 `l06:4` (Hybrid mit RRF), Teil 5 `l06:5` (Reranking), Teil 6 `l06:6` (Multi-Query), Teil 7 `l06:7` (alles im Vergleich) | Du lädst den Index in Qdrant, suchst mit Keywords und Vektoren, verbindest beide mit RRF und siehst, was Reranking und Multi-Query bringen. | LM Studio (E5-Modell, ab Teil 5 auch Chat-Modell), Qdrant, Burp optional, Index aus Lektion 04, Teil 2; kein Open WebUI |
| [07 – RAG](lessons/07-rag-open-webui/README.de.md) | Teil 1 bis 3 `l07:1` bis `l07:3` (Überschriften, semantisch, generierte Fragen), Teil 4 bis 10 `l07:4` bis `l07:10` (Parent-Document, MMR, Metadaten-Filter, Schwellenwert, Hybrid, Rerank, Multi-Query), Teil 11 `l07:11` (alles in einer Fassade) | Du beantwortest Fragen mit Quellenangaben, indem du passende Chunks suchst und sie dem Modell als Kontext gibst (RAG; der Code hängt die Quellenliste an). | LM Studio (Chat- und E5-Modell), Open WebUI, Burp optional, Index aus Lektion 04, Teil 2, 3 bzw. 4; Teil 8 bis 11 zusätzlich Qdrant mit der Collection aus `l06:1` |
| [08 – Evaluierung](lessons/08-evaluations/README.de.md) | Teil 1 `l08:1` (Trefferquote und MRR), Teil 2 `l08:2` (Quellentreue mit einem LLM-Judge), Teil 3 `l08:3` (Korrektheit gegen eine erwartete Kernaussage), Teil 4 `l08:4` (Regression: mit dem vorigen Lauf vergleichen), Teil 5 `l08:5` (promptfoo: Chunking-Strategien vergleichen), Teil 6 `l08:6` (promptfoo: Black-Box-Test der laufenden Fassade) | Du misst, statt nach Augenmaß zu urteilen: die Suche an einem Satz Testfragen, ohne Sprachmodell (billig, wiederholbar), die Quellentreue einer Antwort mit einem Sprachmodell als Judge, ohne Musterlösung, und ihre Korrektheit gegen die erwartete Kernaussage; jeder Lauf der Suchmessung wird gespeichert und mit dem vorigen verglichen; promptfoo vergleicht die Chunking-Strategien in einer Tabelle und testet die laufende Fassade als Black Box. | LM Studio (E5-Modell, Teil 2, 3, 5 und 6 auch Chat-Modell), Burp optional, Index aus Lektion 04, Teil 2; Teil 5 zusätzlich die Indizes aus `l04:1` bis `l04:4`, Teil 6 zusätzlich Qdrant und die Fassade aus Lektion 07 (`npm run l07:11`); kein Open WebUI |

Lektion 02 heißt "Tool-Calls", weil sie darauf hinausläuft: Teil 1 und 2 bringen Wissen von Hand in den Prompt (feste Fakten, frische Webseite), danach holt sich das Modell in Teil 3 und 4 selbst, was es braucht.

Burp ist ab Lektion 01, Teil 3 eingeplant, aber optional: Ist `BURP_PROXY_URL` gesetzt, muss Burp laufen (Intercept aus). Lektion 02, Teil 2 braucht zusätzlich Internet, weil es eine Webseite abruft, und bei gesetztem `BURP_PROXY_URL` auch `BURP_CA_CERT`, weil diese Seite per HTTPS läuft.

Lektion 04, Teil 0 erzeugt die Chunks (Zahl der Anfragen je Zählmethode: [`lessons/04-chunking/GUIDE.de.md`](lessons/04-chunking/GUIDE.de.md#teil-0--chunks-vorbereiten), Vertiefung; die Dauer hängt von deiner Hardware ab). Erzeuge sie zuerst mit `npm run l04:0`. Die Teile 1 bis 4 setzen sie voraus (Teil 5 liest nur den Index aus Teil 2), die Teile 1 bis 4 schreiben die Indizes nach `indexes/` (steht in `.gitignore`, wird beim ersten Lauf angelegt). Lektion 05 liest in allen fünf Teilen den Index aus `l04:2` (Überschriften), ebenso Teil 1 bis 4 von Lektion 08 (Teil 5 braucht alle vier Indizes, Teil 6 die Qdrant-Collection). Lektion 07 hat drei Grundvarianten, jede liest einen anderen Index: `l07:1` den aus `l04:2` (Überschriften), `l07:2` den aus `l04:3` (semantisch), `l07:3` den aus `l04:4` (generierte Fragen); Teil 4 bis 7 nutzen den Index aus `l04:2`, Teil 8 bis 11 die Qdrant-Collection aus `l06:1`. Starte deshalb zuerst den passenden Teil von Lektion 04. Beachte bei `l07:3`: Der Fragen-Index aus `l04:4` deckt standardmäßig (`FULL_CORPUS = true` in `lessons/04-chunking/04-question-generation-chunking.ts`) den ganzen Korpus ab; der erste Lauf dauert viele Minuten. Mit `FULL_CORPUS = false` deckt er nur `01-llm01-prompt-injection.md` ab, `l07:3` beantwortet dann nur Fragen dazu. Alle Teile von Lektion 07 teilen sich den Port der Fassade, es läuft immer nur einer.

## Wenn etwas nicht klappt

Ein Programm gibt Fehler als eine Zeile auf Englisch aus.

**So liest du eine Fehlerzeile:** Der Text vor `– Cause:` sagt, was fehlgeschlagen ist, der Text danach, warum. Bei Netzwerkfehlern ist die Ursache eine Kette. Beispiel:

```text
ERROR Model: Call failed – Cause: Connection error. – fetch failed – connect ECONNREFUSED 127.0.0.1:1234 { model: '...', durationMs: 11 }
```

Hier ist der Modell-Aufruf gescheitert, weil keine Verbindung zustande kam: Auf `127.0.0.1:1234` lauscht niemand (LM-Studio-Server nicht gestartet oder falsche `REMOTE_MODEL_BASE_URL`). Steht dort stattdessen der Burp-Port (z. B. `127.0.0.1:8080`), läuft Burp nicht. Mit gesetztem `DEBUG` kommt zusätzlich der Stacktrace dazu. Unter Linux, macOS und Git Bash: `DEBUG=1 npm run l01:3`. In der PowerShell: `$env:DEBUG=1; npm run l01:3`. In der Eingabeaufforderung (cmd): `set DEBUG=1 && npm run l01:3`.

| Meldung oder Symptom | Ursache und Lösung |
| --- | --- |
| `bad option: --env-file-if-exists` oder `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Deine Node-Version ist zu alt. Prüfe mit `node --version` und installiere Node 22.19 oder neuer. |
| `Burp is not running at http://localhost:8080 – start Burp or clear BURP_PROXY_URL in .env.` | Burp ist nicht gestartet oder lauscht auf einer anderen Adresse. Starte Burp und prüfe unter Proxy, Proxy settings den Listener. Ohne Burp: `BURP_PROXY_URL` in `.env` leeren. |
| `<label>: The request through Burp failed or timed out. Check the listener and turn Intercept off.` | Burp läuft, aber Intercept ist an und hält die Anfrage fest. Schalte Intercept aus (Proxy, Intercept is off). |
| `Something other than Burp answers at http://localhost:8080 (HTTP <status>). Is Open WebUI or another server using that port? Move one of them or fix BURP_PROXY_URL in .env.` | Open WebUI (ohne Docker, `open-webui serve`) lauscht ebenfalls auf Port 8080, wie Burps Standard-Listener und `BURP_PROXY_URL`. Die Burp-Prüfung ruft `/models` über den Proxy ab und erkennt, dass die Antwort nicht von Burp kommt, sofern der Modell-Server direkt erreichbar ist. Ist er es nicht, siehst du stattdessen die Meldung "unreachable or timed out" (siehe unten). Verschiebe einen der beiden: z. B. `open-webui serve --port 3000`, oder ändere den Burp-Listener (Proxy, Proxy settings) und `BURP_PROXY_URL` in `.env`. |
| `<label>: The connectivity check returned HTTP 401. Check the model server and API key.` (oder 502) | Der Server lehnt die Anfrage ab, z. B. wegen eines falschen API-Schlüssels. Das gilt auch mit gesetztem `BURP_PROXY_URL`: Antwortet der Weg über Burp nicht mit einer gültigen `/models`-Liste, prüft das Programm einmal direkt (`Model API directly`) und meldet dessen Fehler. Prüfe Adresse und API-Schlüssel in `.env`. Beim eigentlichen Modell-Aufruf (`Model: Call failed`) beginnt die Ursache mit dem HTTP-Status, z. B. `401 ...`. |
| `<label>: The model server is unreachable or timed out. Check the address and start the server.` oder `Model: Call failed – Cause: Connection error. ...` | Es kam keine Verbindung zustande: Der LM-Studio-Server ist nicht gestartet (Developer-Tab, oder `lms server start`) oder die Adresse in `REMOTE_MODEL_BASE_URL` stimmt nicht. |
| Modell nicht gefunden (HTTP 404 oder 400 in der Ursache) | `REMOTE_MODEL_NAME` oder `REMOTE_EMBEDDING_MODEL_NAME` stimmt nicht mit dem Identifier auf dem Server überein, oder das Modell ist nicht geladen. Suche in der Ursache nach `404` oder `400` und dem Modellnamen. Lade das Modell und kopiere den Identifier aus `lms ps`, `lms ls` oder `<BASE_URL>/models`. |
| `The setting REMOTE_MODEL_NAME is missing from .env (template: .env.example).` | Eine Pflicht-Einstellung fehlt. Vergleiche `.env` mit `.env.example`. |
| `The setting REMOTE_EMBEDDING_MODEL has been replaced. Set REMOTE_EMBEDDING_MODEL_NAME in .env (template: .env.example).` | Deine `.env` ist älter. Benenne `REMOTE_EMBEDDING_MODEL` in `REMOTE_EMBEDDING_MODEL_NAME` um (Vorlage: `.env.example`). |
| `REMOTE_EMBEDDING_MODEL_API_KEY is no longer used: chat and embeddings now use REMOTE_MODEL_API_KEY. Remove the old entry from .env.` (ähnlich für `..._BASE_URL`) | Der alte Schlüssel steht noch in `.env` und weicht vom neuen ab. Lösche ihn. |
| `The setting BURP_PROXY_URL must be a valid HTTP or HTTPS URL.` | Die Adresse ist keine gültige URL. Sie muss mit `http://` oder `https://` beginnen, z. B. `http://localhost:8080`. Das gilt auch für `REMOTE_MODEL_BASE_URL`. |
| `FACADE_PORT 11435 is in use. Stop the other lesson or change FACADE_PORT in .env and the Ollama connection in Open WebUI.` | Eine andere Lektion oder ein echtes Ollama läuft noch auf dem Port. Beende es mit Strg+C oder nimm einen anderen Port und trage ihn auch in Open WebUI ein. |
| `BURP_CA_CERT is missing for HTTPS through Burp. Export Burp’s CA certificate as DER and convert it with openssl x509 -inform der -in burp.der -out burp.pem. Set BURP_CA_CERT=burp.pem or clear BURP_PROXY_URL in .env.` (Lektion 02, Teil 2) | Lektion 02, Teil 2 ruft eine HTTPS-Seite über Burp ab, dafür braucht Node Burps CA-Zertifikat. Export: in Burp Proxy, Proxy settings, Import / export CA certificate, Certificate in DER format, als `burp.der` speichern. Dann im Repo-Root `openssl x509 -inform der -in burp.der -out burp.pem` und in `.env` `BURP_CA_CERT=burp.pem` setzen (Pfad relativ zum Repo-Root). Unter Windows bringt Git for Windows `openssl` mit: Starte die Git Bash (oder rufe `openssl.exe` aus dem Ordner `usr\bin` der Git-Installation auf). Installiere das Zertifikat nicht im Betriebssystem oder Browser: Die Datei genügt, nur dieses Programm vertraut ihr. Hast du es doch installiert, entferne es nach dem Workshop wieder. Oder `BURP_PROXY_URL` leeren. |
| `Cannot read BURP_CA_CERT: ... Check the path and read permissions.` | Pfad falsch oder keine Leserechte. Der Pfad gilt relativ zum Repo-Root. |
| `Prepared chunks are missing. Generate them with npm run l04:0.` (Lektion 04, Teil 1 bis 4) | Die Chunks sind nicht im Repo, sondern werden erzeugt. Starte einmal `npm run l04:0` (E5 muss in LM Studio geladen sein). |
| `Cannot load index ... (headings). Generate it with npm run l04:0, then npm run l04:2.` (Lektion 04 Teil 5, Lektion 05, 07 und 08) | Der Index fehlt. Starte erst `l04:0` und dann das genannte Skript (bei Lektion 04 Teil 5, Lektion 05 und 08 immer `l04:2`; bei Lektion 07 `l04:2`, `l04:3` oder `l04:4`, je nach Datei). |
| `The index <file> is invalid or outdated. Regenerate the chunks with npm run l04:0, then regenerate the index with npm run l04:N.` oder `The chunk manifest is invalid or outdated. Regenerate the chunks with npm run l04:0.` | Die Datei stammt aus einer älteren Version des Programms. Erzeuge zuerst die Chunks und dann den Index neu, mit dem Skript aus der Meldung. |
| `Cannot load the question index <file>. Check the file and QUESTIONS_PER_CHUNK, or regenerate it with npm run l04:0 followed by npm run l04:4.` (nur Lektion 04, Teil 4) | Die Datei des Fragen-Index passt nicht zu `QUESTIONS_PER_CHUNK` oder ist beschädigt. Erzeuge sie mit `l04:4` neu (vorher löschen). In Lektion 07, Teil 3 fehlt der Index dagegen mit `Cannot load index ... (questions). Generate it with npm run l04:0, then npm run l04:4.` (siehe die Zeile oben). |
| `The embedding request failed. Check REMOTE_MODEL_BASE_URL, start the LM Studio server and load the model configured in REMOTE_EMBEDDING_MODEL_NAME.` (Lektion 04, Teil 0) | Der LM-Studio-Server läuft nicht, die Adresse stimmt nicht, oder das E5-Modell ist nicht geladen. Bei 401, 403, 404 und 429 steht der Status in der Ursache hinter `– Cause:`. Eine Ablehnung wegen zu langer Eingabe zählt nicht als Fehler, die braucht das Programm zum Zählen. Lehnt der Server nur die lange Kalibrierungsprobe mit einem anderen Status ab, warnt das Programm (`No reliable token count: The long calibration probe was rejected (HTTP <status>)…`) und macht mit der Zeichenschätzung weiter. |
| `Qdrant is not reachable at http://localhost:6333/. Start it (docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0) or fix QDRANT_URL in .env.` (Lektion 06, Lektion 07 Teil 8 bis 11) | Qdrant läuft nicht oder `QDRANT_URL` stimmt nicht. Starte es wie unter Qdrant einrichten beschrieben (`docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0` oder `docker start qdrant`). Die Adresse in der Meldung ist deine `QDRANT_URL`. |
| `The Qdrant collection <name> does not exist. Load it with npm run l06:1.` (Lektion 06 Teil 2 bis 7, Lektion 07 Teil 8 bis 11) | Qdrant läuft, aber die Collection ist noch nicht geladen (oder du hast einen frischen Container gestartet). Starte `npm run l06:1`; es braucht den Index aus `l04:2` (und `l04:3`, `l04:4`, wenn du diese Varianten willst). |
| Open WebUI zeigt das Modell nicht | Läuft das Programm (Log `Facade ready`)? Stimmt die Adresse in der Ollama-Verbindung? Bei Docker siehe `host.docker.internal` oben. Steht im Log `Rejected request with unexpected Host header`, siehe die Zeile darunter. |
| `Rejected request with unexpected Host header. Use localhost, an IP address, host.docker.internal or the FACADE_HOST name in the Open WebUI connection.` (HTTP 403) | In der Ollama-Verbindung von Open WebUI steht ein Rechnername (z. B. `mein-laptop.local`). Die Fassade lehnt fremde Hostnamen zum Schutz vor DNS-Rebinding ab. Trage `localhost`, eine IP-Adresse oder `host.docker.internal` (Podman: `host.containers.internal`) ein, oder setze den Namen als `FACADE_HOST`. |
| Antwort bricht in Open WebUI ab | Das Modell war zu langsam, oder du hast Stopp gedrückt. Ein Abbruch steht als `Request cancelled.` im Log. Bei zu langsamem Modell: noch einmal versuchen oder ein kleineres Modell nehmen (siehe Hardware). |
| `Context size has been exceeded` (vor allem Lektion 08, Teil 5) | LM Studio lädt das Chat-Modell standardmäßig mit 4 parallelen Plätzen, die sich den Kontext teilen. Lade es mit Max Concurrent Predictions 1 neu (`lms load <identifier> --parallel 1`, siehe LM Studio einrichten). |

## Ordner im Repo

| Pfad | Inhalt |
| --- | --- |
| `lessons/01-…` bis `lessons/08-…` | Die Lektionen, je ein Ordner mit `README.de.md` und einer Datei pro Teil (mit Lernziel und Aufgabe). |
| `lessons/shared/` | Gemeinsame Module (Einstellungen, Logging, Proxy, Fassade, Embeddings, Index, `text.ts` zum Aufräumen von JSON). Beschreibung in `lessons/shared/README.de.md`. |
| `content/owasp-genai-top-10/` | Die OWASP-Dokumente als Markdown; `npm run l04:0` erzeugt `chunks/`. |
| `lessons/04-chunking/00-prepare-chunks.ts` | Erzeugt die Chunks mit `npm run l04:0`. |
| `lessons/05-retrieval-strategies/question-set.json` | Testfragen mit erwarteten Quelldokumenten, die `npm run l05:5` zur Prüfung des Schwellenwerts, `npm run l08:1` für Trefferquote und MRR, `npm run l08:3` für die erwarteten Kernaussagen (Korrektheit) sowie `npm run l08:5` und `l08:6` (promptfoo) nutzen. |
| `lessons/06-hybrid-rerank/` | Hybrid-Suche und Reranking auf Qdrant (braucht den Container aus Qdrant einrichten). |
| `lessons/08-evaluations/` | Suche (Trefferquote, MRR) und Antworten (Quellentreue und Korrektheit mit einem LLM-Judge) messen, Regressionsvergleich und promptfoo-Konfigurationen (Teil 4 bis 6); liest das Fragen-Set aus Lektion 05. |
| `indexes/` | Entsteht in Lektion 04 (Chunks mit Vektoren als JSON), nicht im Repo. |
| `results/` | Entsteht in Lektion 08: Teil 4 speichert Messläufe als JSON, Teil 5 und 6 schreiben HTML-Berichte; nicht im Repo. promptfoo hält seine Läufe außerdem unter `~/.promptfoo/` (siehe Lektion 08). |
| `.env.example` | Vorlage für deine `.env`. |
| `.vscode/` | Startkonfiguration (F5) und Code-Runner-Einstellungen. |

## Lizenz

Der Code steht unter der MIT-Lizenz (siehe `LICENSE`; `package.json` verweist mit `SEE LICENSE IN LICENSE` darauf). Das Verzeichnis `content/owasp-genai-top-10/` ist davon ausgenommen: Die Inhalte stammen aus den OWASP Top 10 für LLM-Anwendungen (OWASP GenAI Security Project, OWASP Foundation) und stehen unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (siehe auch die [OWASP Top 10 für LLM-Anwendungen](https://genai.owasp.org/llm-top-10/)). Das gilt auch für die daraus abgeleiteten Chunks, die `npm run l04:0` in `chunks/` erzeugt (sie sind nicht im Repo). Wer sie weitergibt oder verändert, muss die Quelle nennen, Änderungen kenntlich machen und unter derselben Lizenz weitergeben. Die Sponsorenlogos in `content/owasp-genai-top-10/assets/appendix-projektsponsoren.png` sind Marken ihrer Inhaber und von CC BY-SA 4.0 nicht erfasst. Das Original steht als PDF bei OWASP: [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/). Details stehen in `content/owasp-genai-top-10/README.de.md`.
