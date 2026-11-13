# Lektion 02 – Tool-Calls

[English](README.md) · Erklärungen, erwartete Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du gibst einem Modell Wissen, das es nicht hat: erst von Hand im Prompt (Teil 1 und 2), dann über Werkzeuge, die das Modell selbst anfordert und dein Code ausführt (Teil 3 und 4). Der Name der Lektion beschreibt das Ziel; die ersten beiden Teile führen darauf hin.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-knowledge-and-few-shot.ts`](01-knowledge-and-few-shot.ts) | `npm run l02:1` | Rollen, System-Prompt, Few-Shot (`lesson-02-part-1`) | LM Studio mit Chat-Modell, Open WebUI; Burp optional |
| 2 | [`02-web-scraping.ts`](02-web-scraping.ts) | `npm run l02:2` | Webseite als Kontext, indirekte Prompt-Injection (`lesson-02-part-2`) | wie Teil 1, dazu Internet; mit Burp `BURP_CA_CERT` |
| 3 | [`03-tool-call-base.ts`](03-tool-call-base.ts) | `npm run l02:3` | Tool-Call-Schleife von Hand (`lesson-02-part-3`) | wie Teil 1 |
| 4 | [`04-tool-calls-short.ts`](04-tool-calls-short.ts) | `npm run l02:4` | Dieselbe Schleife mit `createAgent` (`lesson-02-part-4`) | wie Teil 1 |

Die Aufgaben stehen im Kopf jeder Datei.

## Reihenfolge und Abhängigkeiten

- **Vorher:** [Lektion 01](../01-preparation/README.de.md). Open WebUI braucht die Ollama-Verbindung auf die Fassade.
- **Teil 1 → 4** der Reihe nach. Teil 4 vergleichst du mit Teil 3.
- **Ein Teil zur Zeit:** Alle Teile belegen den Port der Fassade (`FACADE_PORT`) und laufen, bis du sie mit Strg+C beendest.
- **Burp** ist optional. Ist `BURP_PROXY_URL` gesetzt, muss Burp laufen (Intercept aus); Teil 2 braucht dann `BURP_CA_CERT`, weil die Webseite per HTTPS geladen wird ([Burp einrichten](../../README.de.md#burp-einrichten)).

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Begriffe, Ablauf je Teil, echte Ausgabe, Stolperfallen, Sicherheitshinweise
- [docs/production.de.md](../../docs/production.de.md): was im Workshop vereinfacht ist, z. B. System-Prompts aus Open WebUI
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss über alle Lektionen
- [docs/trainer.de.md](../../docs/trainer.de.md) (für Trainer, enthält Lösungen): Vorbereitung, Zeiten
- Fehlermeldungen: [Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt) in der Wurzel-README

Zurück zur [Übersicht](../../README.de.md).
