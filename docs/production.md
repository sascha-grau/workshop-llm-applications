# From workshop to production

*Deutsche Fassung: [production.de.md](production.de.md)*

The workshop takes shortcuts on purpose so that every step stays visible. The table lists each shortcut, where it lives in the code and what you do differently in a real application. For such places the [conventions](conventions.md) provide the code marker `VEREINFACHT:`.

## Workshop simplification → in production

| Workshop simplification | Where | In production |
|---|---|---|
| The vector store is a JSON file; every program loads all of it and compares the question with every entry. | `lessons/shared/index.ts` (`writeIndex`, `rankEntries`), header of `lessons/06-hybrid-rerank/01-collection-load.ts` | A vector database with an index for neighbour search (e.g. Qdrant from Lesson 06); update entries individually instead of rewriting a file. |
| Access groups are a constant in the code (`ALLOWED_ACCESS_GROUPS`, `INTERNAL_DOCUMENTS`); the documents carry no permissions themselves. | `lessons/05-retrieval-strategies/03-metadata-filter.ts`, `lessons/shared/index.ts` | Take permissions from the source at ingestion; the server derives the allowed groups from the authenticated identity, never from the request, chat text or a model answer. |
| System prompts from Open WebUI are accepted because you are the user yourself. | `promptFor` in `lessons/07-rag-open-webui/rag.ts`, `lessons/02-tool-calls/01-knowledge-and-few-shot.ts` | Discard them in a multi-user application. Access control must never depend on the prompt. |
| Protection against indirect prompt injection via tags (`<retrieved_context>`) and a note in the system prompt. | `systemPromptFor` and `promptFor` in `lessons/07-rag-open-webui/rag.ts` ([guide, Part 1](../lessons/07-rag-open-webui/GUIDE.md#part-1--rag-with-heading-chunks)), `wrapUntrusted` in `lessons/08-evaluations/evaluation.ts` | This reduces the risk but is not complete protection: add least privilege for tools and handle output before display (OWASP LLM01, LLM05). |
| Reranking with the chat model, one call per candidate. | `lessons/06-hybrid-rerank/05-reranking.ts` | A small, purpose-trained reranking model (cross-encoder), faster and cheaper than a chat model. |
| A fixed score threshold, measured on a few questions with E5. | `lessons/05-retrieval-strategies/04-score-threshold.ts`, `lessons/07-rag-open-webui/07-score-threshold-rag.ts` | Calibrate per model and text type on your own questions (with and without an answer in the corpus), combine with top-k and add a second check ("context does not answer the question"). |
| The judge is the same small model that answered. | `lessons/08-evaluations/02-faithfulness.ts`, judge block in `05-promptfoo-strategies.yaml` | A stronger model as judge. Control cases (as in Parts 2 and 3) are only the minimum: calibrate the judge against a human-labelled sample and measure the agreement. |
| Question set with twelve questions (eleven in promptfoo). | `lessons/05-retrieval-strategies/question-set.json` | A golden set of realistic size from real user questions that grows with every failure seen in operation. With eleven questions there is no clear winner; one question moves the hit ratio by 1/12 (Part 1) or 1/11 (promptfoo). |
| Retrieval is measured only with hit ratio and MRR, relevance per document. | `lessons/08-evaluations/01-hitratio-mrr.ts`, `measureRetrieval` in `evaluation.ts` | Add recall@k and nDCG; these need relevance judgements per chunk. |
| A regression is only reported (exit code 0), compared with the previous run. | `lessons/08-evaluations/04-regression.ts` | Fixed thresholds in CI that fail the build; repeat measurements that use a language model, because they fluctuate. |
| One black-box run with all questions, started by hand. | `lessons/08-evaluations/06-promptfoo-black-box.yaml` | A short smoke test with a few questions and fixed expectations after every deployment; the full evaluation less often, e.g. before a release. |
| The embedding model's tokenizer is downloaded once and cached; the server methods and the character estimate are only a fallback. | `lessons/04-chunking/tokenizer.ts`, `CHARACTERS_PER_TOKEN` in `lessons/shared/embeddings.ts` | Pin the tokenizer together with the model version and ship it, instead of downloading it on the first run. |
| Parent document: children cut by characters, even mid-word; in memory only, re-embedded at every start. | `lessons/04-chunking/05-parent-document.ts`, `splitIntoChildren` in `chunking.ts`, `lessons/07-rag-open-webui/parent-document.ts` | Cut at sentence or paragraph boundaries and persist the child index. |
| The question index only appends and does not notice changed settings or documents. | `lessons/04-chunking/04-question-generation-chunking.ts` | Version content and settings (checksums), re-index changed chunks selectively. |
| No retries on errors (`maxRetries: 0`), so Burp shows no duplicate requests. | `createEmbeddings` in `lessons/shared/embeddings.ts`, `createChatModel` in `lessons/08-evaluations/evaluation.ts` | Retries with backoff for transient errors. |
| No `maxTokens` for chat; locally, length only costs time. | Root README, "Cost note for paid APIs" | Limit the output and set a spending limit with the provider. |
| Facade and Qdrant without authentication, bound to `127.0.0.1` only. | `.env.example`, root README ("Setting up Qdrant") | Authentication, TLS, network boundaries. |
| The demo's pipeline values are copies of the constants in the parts. | `lessons/07-rag-open-webui/demo.ts` | One central configuration per pipeline. |

## Further reading

| Topic | Source |
|---|---|
| MMR (Lesson 05, Part 2) | Carbonell, J.; Goldstein, J. (1998): The Use of MMR, Diversity-Based Reranking for Reordering Documents and Producing Summaries. SIGIR 1998. |
| RRF (Lesson 06, Part 4) | Cormack, G. V.; Clarke, C. L. A.; Büttcher, S. (2009): Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods. SIGIR 2009. |
| Reranking with a cross-encoder (Lesson 06, Part 5) | Nogueira, R.; Cho, K. (2019): Passage Re-ranking with BERT. [arXiv:1901.04085](https://arxiv.org/abs/1901.04085) |
| HyDE, a hypothetical answer as search text (Lesson 06, Part 6) | Gao, L.; Ma, X.; Lin, J.; Callan, J. (2022): Precise Zero-Shot Dense Retrieval without Relevance Labels. [arXiv:2212.10496](https://arxiv.org/abs/2212.10496) |
| Self-query, filters from the question (Lesson 06, Part 3) | LangChain `SelfQueryRetriever` ([source](https://github.com/langchain-ai/langchain/blob/v0.3/libs/langchain/langchain/retrievers/self_query/base.py)) |
| Multi-query (Lesson 06, Part 6; Lesson 07, Part 10) | LangChain `MultiQueryRetriever` ([source](https://github.com/langchain-ai/langchain/blob/v0.3/libs/langchain/langchain/retrievers/multi_query.py)); Rackauckas, Z. (2024): RAG-Fusion: a New Take on Retrieval-Augmented Generation. [arXiv:2402.03367](https://arxiv.org/abs/2402.03367) |
| BM25 (Lesson 06, Part 2) | Robertson, S.; Zaragoza, H. (2009): The Probabilistic Relevance Framework: BM25 and Beyond. Foundations and Trends in Information Retrieval 3(4). |
| Generating questions, doc2query (Lesson 04, Part 4) | Nogueira, R.; Yang, W.; Lin, J.; Cho, K. (2019): Document Expansion by Query Prediction. [arXiv:1904.08375](https://arxiv.org/abs/1904.08375) |
| Semantic chunking with a percentile threshold (Lesson 04, Part 3) | Kamradt, G.: 5 Levels of Text Splitting (notebook, [FullStackRetrieval-com/RetrievalTutorials](https://github.com/FullStackRetrieval-com/RetrievalTutorials/blob/main/tutorials/LevelsOfTextSplitting/5_Levels_Of_Text_Splitting.ipynb)); implemented as `SemanticChunker` in [langchain-experimental](https://github.com/langchain-ai/langchain-experimental/blob/main/libs/experimental/langchain_experimental/text_splitter.py) (threshold type `percentile`, default 95) |
| Parent document (Lesson 04, Part 5) | LangChain `ParentDocumentRetriever` ([source](https://github.com/langchain-ai/langchain/blob/v0.3/libs/langchain/langchain/retrievers/parent_document_retriever.py)) |
| E5 (Lesson 03) | Wang, L. et al. (2022): Text Embeddings by Weakly-Supervised Contrastive Pre-training. [arXiv:2212.03533](https://arxiv.org/abs/2212.03533) |
| Multilingual E5 (Lessons 03 to 08) | Wang, L.; Yang, N.; Huang, X.; Yang, L.; Majumder, R.; Wei, F. (2024): Multilingual E5 Text Embeddings: A Technical Report. [arXiv:2402.05672](https://arxiv.org/abs/2402.05672) |
| RAGAS, faithfulness (Lesson 08) | Es, S. et al. (2023): Ragas: Automated Evaluation of Retrieval Augmented Generation. [arXiv:2309.15217](https://arxiv.org/abs/2309.15217) |
| LLM as a judge (Lesson 08) | Zheng, L. et al. (2023): Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. [arXiv:2306.05685](https://arxiv.org/abs/2306.05685) |
| Context length, top-k (Lessons 05, 07) | Liu, N. F. et al. (2023): Lost in the Middle: How Language Models Use Long Contexts. [arXiv:2307.03172](https://arxiv.org/abs/2307.03172) |
| Corpus and risks | OWASP Top 10 for LLM Applications 2025, OWASP GenAI Security Project: [genai.owasp.org/llm-top-10](https://genai.owasp.org/llm-top-10/) |
