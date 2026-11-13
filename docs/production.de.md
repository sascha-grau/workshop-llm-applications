# Vom Workshop zur Produktion

*English version: [production.md](production.md)*

Der Workshop kürzt bewusst ab, damit jeder Schritt sichtbar bleibt. Die Tabelle nennt jede Abkürzung, die Stelle im Code und was du in einer echten Anwendung anders machst. Für solche Stellen sehen die [Konventionen](conventions.de.md) im Code die Markierung `VEREINFACHT:` vor.

## Workshop-Vereinfachung → in Produktion

| Workshop-Vereinfachung | Stelle | In Produktion |
|---|---|---|
| Der Vektorspeicher ist eine JSON-Datei; jedes Programm lädt sie ganz und vergleicht die Frage mit jedem Eintrag. | `lessons/shared/index.ts` (`writeIndex`, `rankEntries`), Kopf von `lessons/06-hybrid-rerank/01-collection-load.ts` | Vektordatenbank mit Index für die Nachbarsuche (z. B. Qdrant ab Lektion 06), Einträge einzeln aktualisieren statt Datei neu schreiben. |
| Zugriffsgruppen stehen als Konstante im Code (`ALLOWED_ACCESS_GROUPS`, `INTERNAL_DOCUMENTS`); die Dokumente tragen selbst keine Rechte. | `lessons/05-retrieval-strategies/03-metadata-filter.ts`, `lessons/shared/index.ts` | Rechte beim Einlesen aus der Quelle übernehmen; der Server leitet die erlaubten Gruppen aus der angemeldeten Identität ab, nie aus Anfrage, Chat-Text oder Modellantwort. |
| System-Prompts aus Open WebUI werden übernommen, weil du selbst der Nutzer bist. | `promptFor` in `lessons/07-rag-open-webui/rag.ts`, `lessons/02-tool-calls/01-knowledge-and-few-shot.ts` | In einer Mehrbenutzer-Anwendung verwerfen. Zugriffsschutz darf nie vom Prompt abhängen. |
| Schutz vor indirekter Prompt-Injection durch Tags (`<retrieved_context>`) und einen Hinweis im System-Prompt. | `systemPromptFor` und `promptFor` in `lessons/07-rag-open-webui/rag.ts` ([Guide, Teil 1](../lessons/07-rag-open-webui/GUIDE.de.md#teil-1--rag-mit-überschriften-chunks)), `wrapUntrusted` in `lessons/08-evaluations/evaluation.ts` | Das mindert das Risiko, ist aber kein vollständiger Schutz: zusätzlich geringste Rechte für Werkzeuge, Ausgabe vor der Anzeige behandeln (OWASP LLM01, LLM05). |
| Reranking mit dem Chat-Modell, ein Aufruf je Kandidat. | `lessons/06-hybrid-rerank/05-reranking.ts` | Ein eigens trainiertes, kleines Reranking-Modell (Cross-Encoder), schneller und billiger als ein Chat-Modell. |
| Ein fester Schwellenwert, an wenigen Fragen mit E5 gemessen. | `lessons/05-retrieval-strategies/04-score-threshold.ts`, `lessons/07-rag-open-webui/07-score-threshold-rag.ts` | Je Modell und Textart an eigenen Fragen kalibrieren (mit und ohne Antwort im Korpus), mit Top-k kombinieren und eine zweite Prüfung einbauen ("Kontext beantwortet die Frage nicht"). |
| Der Judge ist dasselbe kleine Modell, das geantwortet hat. | `lessons/08-evaluations/02-faithfulness.ts`, Judge-Block in `05-promptfoo-strategies.yaml` | Ein stärkeres Modell als Judge. Gegenproben (wie Teil 2 und 3) sind nur das Minimum: Den Judge gegen eine von Menschen bewertete Stichprobe kalibrieren und die Übereinstimmung messen. |
| Fragen-Set mit zwölf Fragen (elf in promptfoo). | `lessons/05-retrieval-strategies/question-set.json` | Ein Golden Set realistischer Größe aus echten Nutzerfragen, das mit jedem Fehler aus dem Betrieb wächst. Mit elf Fragen gibt es keinen klaren Sieger; eine Frage verschiebt die Trefferquote um 1/12 (Teil 1) bzw. 1/11 (promptfoo). |
| Retrieval wird nur mit Trefferquote und MRR gemessen, Relevanz je Dokument. | `lessons/08-evaluations/01-hitratio-mrr.ts`, `measureRetrieval` in `evaluation.ts` | Zusätzlich Recall@k und nDCG; dafür braucht es Relevanzurteile je Chunk. |
| Regression wird nur gemeldet (Exit-Code 0), verglichen mit dem vorigen Lauf. | `lessons/08-evaluations/04-regression.ts` | Feste Schwellen in der CI, ab denen der Build scheitert; Messungen mit Sprachmodell mehrfach wiederholen, weil sie schwanken. |
| Ein Black-Box-Lauf mit allen Fragen, von Hand gestartet. | `lessons/08-evaluations/06-promptfoo-black-box.yaml` | Kurzer Smoke Test mit wenigen Fragen und festen Erwartungen nach jedem Deployment; die volle Evaluierung seltener, z. B. vor einem Release. |
| Der Tokenizer des Embedding-Modells wird einmal geladen und liegt im Cache; die Server-Methoden und die Zeichenschätzung sind nur Rückfall. | `lessons/04-chunking/tokenizer.ts`, `CHARACTERS_PER_TOKEN` in `lessons/shared/embeddings.ts` | Den Tokenizer mit der Modellversion festlegen und mitliefern, statt ihn beim ersten Lauf zu laden. |
| Parent-Document: Kinder nach Zeichen geschnitten, auch mitten im Wort; nur im Speicher, bei jedem Start neu eingebettet. | `lessons/04-chunking/05-parent-document.ts`, `splitIntoChildren` in `chunking.ts`, `lessons/07-rag-open-webui/parent-document.ts` | An Satz- oder Absatzgrenzen schneiden und den Kinder-Index dauerhaft speichern. |
| Der Fragen-Index hängt nur an und bemerkt keine geänderten Einstellungen oder Dokumente. | `lessons/04-chunking/04-question-generation-chunking.ts` | Inhalt und Einstellungen versionieren (Prüfsummen), geänderte Chunks gezielt neu indizieren. |
| Keine Wiederholungen bei Fehlern (`maxRetries: 0`), damit Burp keine Doppelanfragen zeigt. | `createEmbeddings` in `lessons/shared/embeddings.ts`, `createChatModel` in `lessons/08-evaluations/evaluation.ts` | Wiederholungen mit Wartezeit für vorübergehende Fehler. |
| Kein `maxTokens` beim Chat; lokal kostet Länge nur Zeit. | Wurzel-README, "Kostenhinweis bei bezahlten APIs" | Ausgabe begrenzen und ein Ausgabenlimit beim Anbieter setzen. |
| Fassade und Qdrant ohne Anmeldung, nur an `127.0.0.1`. | `.env.example`, Wurzel-README ("Qdrant einrichten") | Anmeldung, TLS, Netzwerk-Grenzen. |
| Pipeline-Werte der Demo sind Kopien der Konstanten aus den Teilen. | `lessons/07-rag-open-webui/demo.ts` | Eine zentrale Konfiguration je Pipeline. |

## Weiterlesen

| Thema | Quelle |
|---|---|
| MMR (Lektion 05, Teil 2) | Carbonell, J.; Goldstein, J. (1998): The Use of MMR, Diversity-Based Reranking for Reordering Documents and Producing Summaries. SIGIR 1998. |
| RRF (Lektion 06, Teil 4) | Cormack, G. V.; Clarke, C. L. A.; Büttcher, S. (2009): Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods. SIGIR 2009. |
| Reranking mit Cross-Encoder (Lektion 06, Teil 5) | Nogueira, R.; Cho, K. (2019): Passage Re-ranking with BERT. [arXiv:1901.04085](https://arxiv.org/abs/1901.04085) |
| HyDE, hypothetische Antwort als Suchtext (Lektion 06, Teil 6) | Gao, L.; Ma, X.; Lin, J.; Callan, J. (2022): Precise Zero-Shot Dense Retrieval without Relevance Labels. [arXiv:2212.10496](https://arxiv.org/abs/2212.10496) |
| Self-Query, Filter aus der Frage (Lektion 06, Teil 3) | LangChain `SelfQueryRetriever` ([Quelltext](https://github.com/langchain-ai/langchain/blob/v0.3/libs/langchain/langchain/retrievers/self_query/base.py)) |
| Multi-Query (Lektion 06, Teil 6; Lektion 07, Teil 10) | LangChain `MultiQueryRetriever` ([Quelltext](https://github.com/langchain-ai/langchain/blob/v0.3/libs/langchain/langchain/retrievers/multi_query.py)); Rackauckas, Z. (2024): RAG-Fusion: a New Take on Retrieval-Augmented Generation. [arXiv:2402.03367](https://arxiv.org/abs/2402.03367) |
| BM25 (Lektion 06, Teil 2) | Robertson, S.; Zaragoza, H. (2009): The Probabilistic Relevance Framework: BM25 and Beyond. Foundations and Trends in Information Retrieval 3(4). |
| Fragen generieren, doc2query (Lektion 04, Teil 4) | Nogueira, R.; Yang, W.; Lin, J.; Cho, K. (2019): Document Expansion by Query Prediction. [arXiv:1904.08375](https://arxiv.org/abs/1904.08375) |
| Semantisches Chunking mit Perzentil-Schwelle (Lektion 04, Teil 3) | Kamradt, G.: 5 Levels of Text Splitting (Notebook, [FullStackRetrieval-com/RetrievalTutorials](https://github.com/FullStackRetrieval-com/RetrievalTutorials/blob/main/tutorials/LevelsOfTextSplitting/5_Levels_Of_Text_Splitting.ipynb)); umgesetzt als `SemanticChunker` in [langchain-experimental](https://github.com/langchain-ai/langchain-experimental/blob/main/libs/experimental/langchain_experimental/text_splitter.py) (Schwellenart `percentile`, Standard 95) |
| Parent-Document (Lektion 04, Teil 5) | LangChain `ParentDocumentRetriever` ([Quelltext](https://github.com/langchain-ai/langchain/blob/v0.3/libs/langchain/langchain/retrievers/parent_document_retriever.py)) |
| E5 (Lektion 03) | Wang, L. et al. (2022): Text Embeddings by Weakly-Supervised Contrastive Pre-training. [arXiv:2212.03533](https://arxiv.org/abs/2212.03533) |
| Multilingual E5 (Lektion 03 bis 08) | Wang, L.; Yang, N.; Huang, X.; Yang, L.; Majumder, R.; Wei, F. (2024): Multilingual E5 Text Embeddings: A Technical Report. [arXiv:2402.05672](https://arxiv.org/abs/2402.05672) |
| RAGAS, Quellentreue (Lektion 08) | Es, S. et al. (2023): Ragas: Automated Evaluation of Retrieval Augmented Generation. [arXiv:2309.15217](https://arxiv.org/abs/2309.15217) |
| LLM als Judge (Lektion 08) | Zheng, L. et al. (2023): Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. [arXiv:2306.05685](https://arxiv.org/abs/2306.05685) |
| Kontextlänge, Top-k (Lektion 05, 07) | Liu, N. F. et al. (2023): Lost in the Middle: How Language Models Use Long Contexts. [arXiv:2307.03172](https://arxiv.org/abs/2307.03172) |
| Korpus und Risiken | OWASP Top 10 for LLM Applications 2025, OWASP GenAI Security Project: [genai.owasp.org/llm-top-10](https://genai.owasp.org/llm-top-10/) |
