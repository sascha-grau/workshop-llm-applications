# Lektion 02 – Tool-Calls

[English](README.md)

**Lernziel:** Du verstehst, wie ein Modell Wissen bekommt, das es nicht hat, und wie es Werkzeuge selbst aufrufen kann, um es zu holen. Der Name der Lektion beschreibt das Ziel; die ersten beiden Teile führen darauf hin.

**Warum Teil 1 und 2?** Dort steckst du das Wissen von Hand in den Prompt: erst als fester Text mit Few-Shot-Beispielen, dann als Webseite, die dein Code lädt (inklusive des Risikos der indirekten Prompt-Injection). Erst Teil 3 und 4 lassen das Modell selbst entscheiden, wann es ein Werkzeug aufruft und Daten holt. So siehst du den Unterschied zwischen "Entwickler liefert den Kontext" und "Modell fordert ihn an".

| Teil | Datei | npm-Skript | Lernziel | Braucht |
|---|---|---|---|---|
| 1 | `01-knowledge-and-few-shot.ts` | `npm run l02:1` | Rollen, System-Prompt, Few-Shot, `temperature` (`lesson-02-part-1`) | LM Studio, Open WebUI, Burp optional |
| 2 | `02-web-scraping.ts` | `npm run l02:2` | Webseite als Kontext, indirekte Prompt-Injection (`lesson-02-part-2`) | wie Teil 1, Internet; mit Burp `BURP_CA_CERT` |
| 3 | `03-tool-call-base.ts` | `npm run l02:3` | Tool-Call-Schleife von Hand (`lesson-02-part-3`) | wie Teil 1 |
| 4 | `04-tool-calls-short.ts` | `npm run l02:4` | dieselbe Schleife mit `createAgent` (`lesson-02-part-4`) | wie Teil 1 |

**Sicherheit:** Trennmarken (`<scraped-context>`) und die Regel im System-Prompt, nur aus dem Kontext zu antworten, verringern das Risiko von Prompt Injection, schützen aber nicht vollständig; System-Prompts vom Client (Open WebUI) sind nicht vertrauenswürdig.

**Reihenfolge:** Arbeite die Teile der Reihe nach durch. Teil 4 vergleichst du mit Teil 3. Die Fassade belegt immer denselben Port, es läuft nur ein Teil gleichzeitig.

Voraussetzung ist [Lektion 01](../01-preparation/README.de.md). Einrichtung: [Haupt-README](../../README.de.md).
