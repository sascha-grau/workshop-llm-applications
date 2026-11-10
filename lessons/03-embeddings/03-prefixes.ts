// Lektion 03 – Embeddings, Teil 3: Was die Präfixe bringen
//
// Lernziel: Du siehst messbar, wie viel die Rollen-Präfixe `query: ` und `passage: ` ausmachen.
//
// Embedding-Modelle wie E5 und EmbeddingGemma wurden mit Präfixen trainiert, die die Rolle eines
// Texts markieren: eines für Suchanfragen, eines für gespeicherte Dokumente. Das Experiment lässt
// dieselbe Suche einmal ohne und einmal mit Präfixen laufen.
//
// Jeder Fall hat drei Texte: eine Anfrage, eine ähnliche Frage eines anderen Nutzers und die
// Antwort. Die ähnliche Frage sieht der Anfrage zum Verwechseln ähnlich, beantwortet sie aber
// nicht. Es werden zwei Indizes durchsucht:
// - Index A enthält nur die Antworten.
// - Index B enthält die Antworten plus die ähnlichen Fragen. Hier kann eine ähnliche Frage die
//   richtige Antwort von Platz 1 verdrängen, ein typisches Problem, wenn FAQ-Einträge oder
//   Chat-Verläufe im Index landen.
//
// Pro Modell und Variante zählt das Programm, wie oft die richtige Antwort auf Platz 1 steht, und
// zeigt dann für jede Anfrage in Index B Platz und Scores.
//
// Modellbeschreibungen: E5 https://huggingface.co/intfloat/multilingual-e5-base,
// EmbeddingGemma https://huggingface.co/google/embeddinggemma-300m (Name in .env:
// REMOTE_EMBEDDING_GEMMA_MODEL_NAME; siehe embeddings.ts).
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und beiden Modellen (E5 und
// EmbeddingGemma). Burp ist optional.
// Start: npm run l03:3   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Lies die erste Tabelle: Bei welchem Modell und in welchem Index bringen die Präfixe am
//      meisten Treffer auf Platz 1?
//   2. Füge einen eigenen Fall mit Anfrage, ähnlicher Frage und Antwort zu `cases` hinzu. Verdrängt
//      deine ähnliche Frage die Antwort?
//   3. Vertausche in der Variante withPrefix Anfrage- und Passage-Präfix. Wird es schlechter als
//      ganz ohne Präfix?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logError, logInvocation } from '../shared/logging.ts';
import { models } from './embeddings.ts';
import { assertVectorCount, cosineSimilarity, createEmbeddings } from '../shared/embeddings.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Jede Anfrage dieses Experiments erscheint in der
  // HTTP-History.
  useBurpIfConfigured();

  // Beide Modelle kommen aus embeddings.ts: E5 (REMOTE_EMBEDDING_MODEL_NAME) und
  // EmbeddingGemma (REMOTE_EMBEDDING_GEMMA_MODEL_NAME), vom selben Server unter anderem Namen bereitgestellt. Jedes hat eigene Präfixe:
  // eines für die Suchanfrage, eines für die gespeicherten Texte.
  // Die Fälle: query = Suchanfrage, similarQuestion = ähnliche Frage (Ablenker), answer = Antwort.
  const cases = [
    {
      query: 'Wie schütze ich mein LLM vor Prompt Injection?',
      similarQuestion: 'Wie kann ich Prompt Injection bei meinem Chatbot verhindern?',
      answer: {
        kind: 'answer' as const,
        text: 'Gegen Prompt Injection hilft: Eingaben und Ausgaben filtern, dem Modell nur die nötigsten Rechte geben und kritische Aktionen von einem Menschen freigeben lassen.',
      },
    },
    {
      query: 'Was ist ein Jailbreak?',
      similarQuestion: 'Was genau versteht man unter einem Jailbreak bei Sprachmodellen?',
      answer: {
        kind: 'answer' as const,
        text: 'Bei einem Jailbreak bringt ein Angreifer das Modell mit geschickt formulierten Eingaben dazu, seine Sicherheitsregeln vollständig zu ignorieren.',
      },
    },
    {
      query: 'Darf ein Passwort im System-Prompt stehen?',
      similarQuestion: 'Kann ich Zugangsdaten in den System-Prompt schreiben?',
      answer: {
        kind: 'answer' as const,
        text: 'Der System-Prompt ist kein Geheimnis und kann ausgelesen werden. Zugangsdaten und Passwörter gehören deshalb in einen geschützten Speicher außerhalb des Modells.',
      },
    },
    {
      query: 'Wie verhindere ich, dass mein Agent zu viel darf?',
      similarQuestion: 'Wie begrenze ich die Rechte eines KI-Agenten?',
      answer: {
        kind: 'answer' as const,
        text: 'Gib dem Agenten nur die Werkzeuge und Berechtigungen, die er wirklich braucht, und verlange für folgenreiche Aktionen eine menschliche Freigabe.',
      },
    },
    {
      query: 'Was bedeutet Datenvergiftung?',
      similarQuestion: 'Was ist mit Data Poisoning gemeint?',
      answer: {
        kind: 'answer' as const,
        text: 'Bei der Datenvergiftung manipuliert ein Angreifer Trainings-, Fine-Tuning- oder Embedding-Daten, um Hintertüren oder Verzerrungen in das Modell einzuschleusen.',
      },
    },
    {
      query: 'Warum halluziniert mein Modell?',
      similarQuestion: 'Wieso erfindet das LLM manchmal Fakten?',
      answer: {
        kind: 'answer' as const,
        text: 'Sprachmodelle füllen Lücken in ihren Trainingsdaten mit statistisch plausiblen Mustern. So entstehen Antworten, die überzeugend klingen, aber frei erfunden sind.',
      },
    },
    {
      query: 'Wie begrenze ich die Kosten meiner LLM-Anwendung?',
      similarQuestion: 'Wie verhindere ich, dass Nutzer mein Token-Budget aufbrauchen?',
      answer: {
        kind: 'answer' as const,
        text: 'Gegen unbegrenzten Verbrauch helfen Rate Limits und Kontingente pro Nutzer, eine Obergrenze für die Eingabelänge sowie Zeitlimits für aufwendige Anfragen.',
      },
    },
    {
      query: 'Muss ich die Ausgabe des Modells prüfen, bevor ich sie weiterverarbeite?',
      similarQuestion: 'Sollte man LLM-Antworten validieren, bevor sie in eine Datenbank gehen?',
      answer: {
        kind: 'answer' as const,
        text: 'Behandle die Ausgabe des Modells wie eine nicht vertrauenswürdige Benutzereingabe: validieren, bereinigen und kodieren, bevor sie an Shell, Datenbank oder Browser geht.',
      },
    },
  ];

  const indexLabels = { answers: 'Index A: answers only', all: 'Index B: answers + similar questions' };
  const variantLabels = { withoutPrefix: 'without prefix', withPrefix: 'with prefix' };
  type IndexKey = keyof typeof indexLabels;
  type VariantKey = keyof typeof variantLabels;
  type EntryKind = 'correctAnswer' | 'answer' | 'similarQuestion';

  // Beide Indizes in einem Array: Die Antworten allein sind Index A, mit den ähnlichen Fragen
  // zusammen Index B. Die eigene Antwort eines Falls wird unten per Identität erkannt
  // (`entry === answer`); die Antworten der anderen Fälle sind für diese Anfrage falsche Antworten.
  const entries = [
    ...cases.map(({ answer }) => answer),
    ...cases.map(({ similarQuestion }) => ({ kind: 'similarQuestion' as const, text: similarQuestion })),
  ];

  await checkModelServer({ viaBurp: true });

  for (const model of models) {
    try {
      await logInvocation('Embedding', { model: model.name, entryCount: entries.length }, async () => {
        const embeddings = createEmbeddings(model.name);

        const variants: { key: VariantKey; queryPrefix: string; passagePrefix: string }[] = [
          { key: 'withoutPrefix', queryPrefix: '', passagePrefix: '' },
          { key: 'withPrefix', queryPrefix: model.queryPrefix, passagePrefix: model.passagePrefix },
        ];
        // Pro Variante: bei wie vielen Anfragen die richtige Antwort auf Platz 1 steht, in Index A und B.
        const firstPlaceCounts: Record<VariantKey, Record<IndexKey, number>> = {
          withoutPrefix: { answers: 0, all: 0 },
          withPrefix: { answers: 0, all: 0 },
        };
        // Pro Anfrage und Variante: Platz und Scores in Index B.
        const caseDetails: Record<string, Partial<Record<VariantKey, string>>> = {};

        for (const variant of variants) {
          // NEU: Das Präfix ist nur Teil der Eingabe ans Modell. Wer es ändert, muss jeden Eintrag
          // neu einbetten.
          const entryVectors = await embeddings.embedDocuments(
            entries.map(({ text }) => `${variant.passagePrefix}${text}`),
          );

          assertVectorCount(entryVectors, entries.length);

          for (const { query, answer } of cases) {
            const queryVector = await embeddings.embedQuery(`${variant.queryPrefix}${query}`);
            // Für die Suche zählt die Reihenfolge der Kandidaten zur selben Anfrage, nicht die Höhe
            // eines einzelnen Scores.
            const hits = entries
              .map<{ kind: EntryKind; similarity: number }>((entry, index) => ({
                kind: entry === answer ? 'correctAnswer' : entry.kind,
                similarity: cosineSimilarity(queryVector, entryVectors[index]),
              }))
              .sort((a, b) => b.similarity - a.similarity);

            const rank = hits.findIndex(({ kind }) => kind === 'correctAnswer') + 1;
            const bestSimilarQuestion = hits.find(({ kind }) => kind === 'similarQuestion')!;
            // Index A ist Index B ohne die ähnlichen Fragen: Man überspringt sie einfach im Ranking.
            const bestHitInIndexA = hits.find(({ kind }) => kind !== 'similarQuestion')!;

            if (bestHitInIndexA.kind === 'correctAnswer') firstPlaceCounts[variant.key].answers++;
            if (rank === 1) firstPlaceCounts[variant.key].all++;

            (caseDetails[query] ??= {})[variant.key] =
              `Rank ${rank} | Answer ${hits[rank - 1].similarity.toFixed(3)}` +
              ` | Question ${bestSimilarQuestion.similarity.toFixed(3)}`;
          }
        }

        console.log(
          `\n${model.shortName}: For how many of the ${cases.length} queries is the correct answer ranked first?`,
        );
        console.table(Object.fromEntries(variants.map(({ key }) => [
          variantLabels[key], Object.fromEntries(
            (Object.keys(indexLabels) as IndexKey[]).map((index) => [indexLabels[index], firstPlaceCounts[key][index]]),
          ),
        ])));
        console.log(
          `${model.shortName}, Index B: rank and score of the correct answer, and score of the best similar question`,
        );
        console.table(Object.fromEntries(Object.entries(caseDetails).map(([query, details]) => [
          query, Object.fromEntries(variants.map(({ key }) => [variantLabels[key], details[key]])),
        ])));
      });
    } catch (error) {
      logError(error);
      // Weitermachen: Ein fehlgeschlagenes Modell soll den Vergleich mit dem anderen nicht stoppen.
      process.exitCode = 1;
    }
  }
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
