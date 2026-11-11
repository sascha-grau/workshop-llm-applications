# OWASP Top 10 für LLM-Applikationen – Version 2025

[English](README.md)

Diese Markdown-Fassung enthält das Vorwort, die zehn Risikokapitel und den Anhang der deutschen OWASP-Ausgabe vom **11. März 2025**.

Quelle: [OWASP GenAI Security Project](https://genai.owasp.org/) ([Original-PDF der OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)), OWASP Top 10 for Large Language Model Applications 2025, deutsche Übersetzung (Ausgabe vom 11. März 2025, siehe Versionshistorie unten). Die Markdown-Dateien wurden aus dem von OWASP veröffentlichten PDF dieser Ausgabe erzeugt.

## Dokumente

| Dokument | Datei | Gedruckte Seiten |
| --- | --- | --- |
| Vorwort der Projektleiter | [Vorwort](00-vorwort-der-projektleiter.md) | 1–3 |
| LLM01:2025 Prompt Injection | [Prompt Injection](01-llm01-prompt-injection.md) | 4–8 |
| LLM02:2025 Offenlegung sensibler Informationen | [Offenlegung sensibler Informationen](02-llm02-offenlegung-sensibler-informationen.md) | 9–12 |
| LLM03:2025 Lieferkette | [Lieferkette](03-llm03-lieferkette.md) | 13–18 |
| LLM04: Poisoning von Daten und Modellen | [Poisoning von Daten und Modellen](04-llm04-poisoning-von-daten-und-modellen.md) | 19–21 |
| LLM05:2025 Fehlerhafte Ausgabeverarbeitung | [Fehlerhafte Ausgabeverarbeitung](05-llm05-fehlerhafte-ausgabeverarbeitung.md) | 22–24 |
| LLM06:2025 Übermäßige Handlungsfreiheit | [Übermäßige Handlungsfreiheit](06-llm06-uebermaessige-handlungsfreiheit.md) | 25–28 |
| LLM07:2025 Offenlegung des Systems Prompts | [Offenlegung des Systems Prompts](07-llm07-offenlegung-des-system-prompts.md) | 29–31 |
| LLM08:2025 Schwachstellen in Vektoren und Embeddings | [Schwachstellen in Vektoren und Embeddings](08-llm08-schwachstellen-in-vektoren-und-embeddings.md) | 32–35 |
| LLM09:2025 Fehlinformationen | [Fehlinformationen](09-llm09-fehlinformationen.md) | 36–39 |
| LLM10:2025 Unbegrenzter Verbrauch | [Unbegrenzter Verbrauch](10-llm10-unbegrenzter-verbrauch.md) | 40–44 |
| Appendix 1: LLM Application Architecture and Threat Modeling | [Appendix 1](11-appendix-llm-application-architecture-and-threat-modeling.md) | 45–47 |

## Übertragung und Lizenz

Die Inhalte stammen von OWASP und den im Vorwort genannten Mitwirkenden und Übersetzern. Die Übertragung in Markdown erfolgte mit KI-Unterstützung anhand des PDFs: Überschriften wurden hierarchisch ausgezeichnet, Seitenumbrüche und wiederkehrende Fußzeilen entfernt, Zeilen zusammengeführt und OCR-Erkennungsfehler korrigiert. Verlinkte Referenzen wurden aus den PDF-Verknüpfungen übernommen. Der englische Anhang bleibt in der Sprache der Vorlage; Abbildungen und Unterstützerangaben sind dort enthalten. Inhaltliche Eigenheiten und Schreibweisen der Vorlage bleiben erhalten.

Original und Markdown-Bearbeitung stehen unter **[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)**. Die Lizenz gestattet Weitergabe und Bearbeitung auch für kommerzielle Zwecke unter Namensnennung, Kennzeichnung von Änderungen und Weitergabe unter derselben Lizenz. Zusätzliche rechtliche oder technische Einschränkungen sind nicht zulässig. [Vollständiger Lizenztext](https://creativecommons.org/licenses/by-sa/4.0/legalcode).

## Hinweis zur Namensnennung

Dieses Verzeichnis enthält Inhalte des OWASP GenAI Security Project (OWASP Foundation) und seiner Mitwirkenden, die im Vorwort genannt sind. Sie wurden für den Workshop in Markdown überführt (Änderungen wie oben beschrieben). Für dieses Verzeichnis gilt CC BY-SA 4.0, nicht die MIT-Lizenz des restlichen Repos. Ausgenommen sind die Sponsorenlogos in `assets/appendix-projektsponsoren.png`: Sie sind Marken ihrer Inhaber und von CC BY-SA 4.0 nicht erfasst.

## Die Ordner `assets/` und `chunks/`

`assets/` enthält die beiden Bilder, die die OWASP-Dokumente einbinden (Architekturdiagramm und Projektsponsoren).

`chunks/` gehört nicht zum Repo (steht in `.gitignore`). Du erzeugst den Ordner selbst mit `npm run l04:0` (Programm: `lessons/04-chunking/00-prepare-chunks.ts`, Lektion 04, Teil 0). Er enthält dieselben Texte in kleinen Stücken (Chunks): eine Datei pro Chunk, benannt `<dokument>--001.md`, `<dokument>--002.md` und so weiter. Jeder Chunk wiederholt oben die Überschriften-Kette seines Dokuments, damit er allein verständlich bleibt, und wird samt Präfix `passage: ` gegen das 512-Token-Budget des Embedding-Modells E5 geprüft. Lektion 04, Teil 1 bis 4 brauchen diese Dateien; Lektion 04, Teil 5 und die Lektionen 05 bis 07 brauchen nur die daraus erzeugten Indizes.

`chunks/manifest.json` entsteht dabei mit. Es beschreibt die Chunks maschinenlesbar: verwendetes Modell, Token-Limit, Präfix, Prüfsumme jedes Quelldokuments und für jeden Chunk Dateiname, Quell-Position, Prüfsumme und Token-Zahl. `counting_method` sagt, ob die Tokens gezählt oder nur geschätzt wurden.

Die erzeugten Chunks sind Bearbeitungen der OWASP-Texte und stehen daher ebenfalls unter CC BY-SA 4.0, wenn du sie weitergibst.

## Versionshistorie der Vorlage

| Datum | Veröffentlichung |
| --- | --- |
| 2023-08-01 | Version 1.0 Release |
| 2023-10-16 | Version 1.1 Release |
| 2024-11-18 | Version 2025 Release |
| 2025-03-11 | German Version 2025 Release |
