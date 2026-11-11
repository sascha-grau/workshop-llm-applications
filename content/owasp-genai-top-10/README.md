# OWASP Top 10 for LLM Applications – Version 2025

[Deutsch](README.de.md)

This Markdown edition contains the foreword, the ten risk chapters and the appendix of the German OWASP edition of **11 March 2025**. Note: the documents in this folder are written in German (the appendix is in English). The German file names and chapter titles are kept verbatim below, with English glosses.

Source: [OWASP GenAI Security Project](https://genai.owasp.org/) ([original PDF of the OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)), OWASP Top 10 for Large Language Model Applications 2025, German translation (edition of 11 March 2025, see version history below). The Markdown files were generated from the PDF of this edition published by OWASP.

## Documents

| Document | File | Printed pages |
| --- | --- | --- |
| Vorwort der Projektleiter (Foreword by the project leads) | [Vorwort](00-vorwort-der-projektleiter.md) | 1–3 |
| LLM01:2025 Prompt Injection | [Prompt Injection](01-llm01-prompt-injection.md) | 4–8 |
| LLM02:2025 Offenlegung sensibler Informationen (Sensitive Information Disclosure) | [Offenlegung sensibler Informationen](02-llm02-offenlegung-sensibler-informationen.md) | 9–12 |
| LLM03:2025 Lieferkette (Supply Chain) | [Lieferkette](03-llm03-lieferkette.md) | 13–18 |
| LLM04: Poisoning von Daten und Modellen (Data and Model Poisoning) | [Poisoning von Daten und Modellen](04-llm04-poisoning-von-daten-und-modellen.md) | 19–21 |
| LLM05:2025 Fehlerhafte Ausgabeverarbeitung (Improper Output Handling) | [Fehlerhafte Ausgabeverarbeitung](05-llm05-fehlerhafte-ausgabeverarbeitung.md) | 22–24 |
| LLM06:2025 Übermäßige Handlungsfreiheit (Excessive Agency) | [Übermäßige Handlungsfreiheit](06-llm06-uebermaessige-handlungsfreiheit.md) | 25–28 |
| LLM07:2025 Offenlegung des Systems Prompts (System Prompt Leakage) | [Offenlegung des Systems Prompts](07-llm07-offenlegung-des-system-prompts.md) | 29–31 |
| LLM08:2025 Schwachstellen in Vektoren und Embeddings (Vector and Embedding Weaknesses) | [Schwachstellen in Vektoren und Embeddings](08-llm08-schwachstellen-in-vektoren-und-embeddings.md) | 32–35 |
| LLM09:2025 Fehlinformationen (Misinformation) | [Fehlinformationen](09-llm09-fehlinformationen.md) | 36–39 |
| LLM10:2025 Unbegrenzter Verbrauch (Unbounded Consumption) | [Unbegrenzter Verbrauch](10-llm10-unbegrenzter-verbrauch.md) | 40–44 |
| Appendix 1: LLM Application Architecture and Threat Modeling | [Appendix 1](11-appendix-llm-application-architecture-and-threat-modeling.md) | 45–47 |

## Conversion and license

The content comes from OWASP and the contributors and translators named in the foreword. The conversion to Markdown was done with AI assistance based on the PDF: headings were marked up hierarchically, page breaks and recurring footers were removed, lines were joined and OCR recognition errors were corrected. Linked references were taken from the PDF's hyperlinks. The English appendix remains in the language of the source; figures and supporter credits are included there. Peculiarities of content and spelling in the source are preserved.

The original and the Markdown adaptation are licensed under **[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)**. The license permits sharing and adaptation, including for commercial purposes, provided you give attribution, indicate changes and distribute under the same license. No additional legal or technical restrictions are permitted. [Full license text](https://creativecommons.org/licenses/by-sa/4.0/legalcode).

## Attribution notice

This directory contains content from the OWASP GenAI Security Project (OWASP Foundation) and its contributors named in the foreword. It was converted to Markdown for the workshop (changes as described above). CC BY-SA 4.0 applies to this directory, not the MIT license of the rest of the repo. Excluded are the sponsor logos in `assets/appendix-projektsponsoren.png`: they are trademarks of their owners and are not covered by CC BY-SA 4.0.

## The `assets/` and `chunks/` folders

`assets/` contains the two images embedded by the OWASP documents (architecture diagram and project sponsors).

`chunks/` is not part of the repo (it is listed in `.gitignore`). You generate the folder yourself with `npm run l04:0` (program: `lessons/04-chunking/00-prepare-chunks.ts`, Lesson 04, Part 0). It contains the same texts in small pieces (chunks): one file per chunk, named `<document>--001.md`, `<document>--002.md` and so on. Each chunk repeats the heading chain of its document at the top so that it stays understandable on its own, and, including the prefix `passage: `, is checked against the 512-token budget of the E5 embedding model. Lesson 04, Parts 1 to 4 need these files; Lesson 04, Part 5 and Lessons 05 to 07 only need the indexes generated from them.

`chunks/manifest.json` is created at the same time. It describes the chunks in machine-readable form: model used, token limit, prefix, checksum of each source document and, for each chunk, file name, source position, checksum and token count. `counting_method` says whether the tokens were counted or only estimated.

The generated chunks are adaptations of the OWASP texts and are therefore also licensed under CC BY-SA 4.0 if you redistribute them.

## Version history of the source

| Date | Release |
| --- | --- |
| 2023-08-01 | Version 1.0 Release |
| 2023-10-16 | Version 1.1 Release |
| 2024-11-18 | Version 2025 Release |
| 2025-03-11 | German Version 2025 Release |
