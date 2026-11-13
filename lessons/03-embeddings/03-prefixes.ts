// Lektion 03 – Embeddings, Teil 3: Was die Präfixe bringen
//
// Lernziel: Du siehst messbar, wie viel die Rollen-Präfixe für Anfrage und Passage ausmachen.
// Braucht:  wie Teil 2.
// Start:    npm run l03:3   (oder F5)
// Erklärt:  lessons/03-embeddings/GUIDE.de.md → „Teil 3“
//
// Aufgabe:
//   1. Lies die erste Tabelle: Bei welchem Modell und in welchem Index bringen die Präfixe am meisten Treffer
//      auf Platz 1?
//   2. Füge `cases` einen eigenen Fall hinzu (Anfrage, ähnliche Frage, Antwort). Verdrängt deine ähnliche
//      Frage die Antwort?
//      ↺ Danach den Fall wieder entfernen.
//   3. Vertausche in der Variante `withPrefix` Anfrage- und Passage-Präfix. Wird es schlechter als ohne Präfix?
//      ↺ Danach zurücktauschen.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logError, logInvocation } from '../shared/logging.ts';
import { models } from './embeddings.ts';
import { assertVectorCount, cosineSimilarity, createEmbeddings } from '../shared/embeddings.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Mit Burp erscheint jede Anfrage dieses Experiments in der HTTP-History.
  useBurpIfConfigured();

  // Je Fall: query = Suchanfrage, similarQuestion = ähnliche Frage eines anderen Nutzers (Ablenker),
  // answer = die richtige Antwort.
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
  type VariantKey = keyof typeof variantLabels;
  type EntryKind = 'correctAnswer' | 'answer' | 'similarQuestion';

  // KERN 1: Beide Indizes in einem Array: Die Antworten allein sind Index A, mit den ähnlichen Fragen Index B.
  // Die eigene Antwort eines Falls wird unten per Identität erkannt (`entry === answer`); die Antworten der
  // anderen Fälle sind für diese Anfrage falsche Antworten.
  const entries = [
    ...cases.map(({ answer }) => answer),
    ...cases.map(({ similarQuestion }) => ({ kind: 'similarQuestion' as const, text: similarQuestion })),
  ];

  await checkModelServer({ viaBurp: true });

  for (const model of models) {
    try {
      await logInvocation('Embedding', { model: model.name, entryCount: entries.length }, async () => {
        const embeddings = createEmbeddings(model.name);

        // KERN 2: Dieselbe Suche zweimal: ohne Präfix und mit den Präfixen des Modells.
        const variants: { key: VariantKey; queryPrefix: string; passagePrefix: string }[] = [
          { key: 'withoutPrefix', queryPrefix: '', passagePrefix: '' },
          { key: 'withPrefix', queryPrefix: model.queryPrefix, passagePrefix: model.passagePrefix },
        ];
        // Pro Variante: bei wie vielen Anfragen die richtige Antwort auf Platz 1 steht, in Index A und B.
        const firstPlaceCounts = {
          withoutPrefix: { answers: 0, all: 0 },
          withPrefix: { answers: 0, all: 0 },
        };
        // Pro Anfrage und Variante: Platz und Scores in Index B.
        const caseDetails: { [query: string]: { withoutPrefix?: string; withPrefix?: string } } = {};

        for (const variant of variants) {
          // Das Präfix ist nur Teil der Eingabe ans Modell. Wer es ändert, muss jeden Eintrag neu einbetten.
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

            // KERN 3: Platz der richtigen Antwort in Index B. Index A ist Index B ohne die ähnlichen Fragen:
            // Man überspringt sie einfach im Ranking.
            const rank = hits.findIndex(({ kind }) => kind === 'correctAnswer') + 1;
            const bestSimilarQuestion = hits.find(({ kind }) => kind === 'similarQuestion')!;
            const bestHitInIndexA = hits.find(({ kind }) => kind !== 'similarQuestion')!;

            if (bestHitInIndexA.kind === 'correctAnswer') firstPlaceCounts[variant.key].answers++;
            if (rank === 1) firstPlaceCounts[variant.key].all++;

            if (!caseDetails[query]) caseDetails[query] = {};
            caseDetails[query][variant.key] =
              `Rank ${rank} | Answer ${hits[rank - 1].similarity.toFixed(3)}` +
              ` | Question ${bestSimilarQuestion.similarity.toFixed(3)}`;
          }
        }

        console.log(
          `\n${model.shortName}: For how many of the ${cases.length} queries is the correct answer ranked first?`,
        );
        const firstPlaceTable: { [variant: string]: { [index: string]: number } } = {};
        for (const { key } of variants) {
          firstPlaceTable[variantLabels[key]] = {
            [indexLabels.answers]: firstPlaceCounts[key].answers,
            [indexLabels.all]: firstPlaceCounts[key].all,
          };
        }
        console.table(firstPlaceTable);
        console.log(
          `${model.shortName}, Index B: rank and score of the correct answer, and score of the best similar question`,
        );
        const detailsTable: { [query: string]: { [variant: string]: string | undefined } } = {};
        for (const [query, details] of Object.entries(caseDetails)) {
          const row: { [variant: string]: string | undefined } = {};
          for (const { key } of variants) row[variantLabels[key]] = details[key];
          detailsTable[query] = row;
        }
        console.table(detailsTable);
      });
    } catch (error) {
      logError(error);
      // Weitermachen: Ein fehlgeschlagenes Modell soll den Vergleich mit dem anderen nicht stoppen.
      process.exitCode = 1;
    }
  }
}

await runMain(main);
