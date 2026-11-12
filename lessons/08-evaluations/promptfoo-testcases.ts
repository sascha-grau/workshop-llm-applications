// Lektion 08 – Evaluierung: Testfälle für promptfoo (Teil 5 und 6), kein eigener Teil.
//
// promptfoo erwartet eine Liste von Testfällen. Das Fragen-Set aus Lektion 05 bleibt die eine Quelle
// der Wahrheit; diese Funktion übersetzt nur jede Frage in die Variablen, die Konfiguration und
// Prüfungen lesen: `query` (die Frage), `keyPoint` (die erwartete Kernaussage) und
// `expectedSources` (die erwarteten Dateien). Die Dateien kommen als Text mit ", " dazwischen: Eine
// Liste als Variable würde promptfoo in einen Testfall je Eintrag aufspalten.
import { INTERNAL_DOCUMENTS } from '../shared/index.ts';
import { loadQuestionSet } from '../05-retrieval-strategies/retrieval.ts';

export default function testCases() {
  return loadQuestionSet().questions
    // Fragen, deren Antwort nur im internen Anhang steht (F-11), kann der Assistent nie beantworten:
    // Er sucht nur in öffentlichen Chunks (Lektion 05, Teil 3). Als Fehlschlag gezählt, würden sie
    // jede Strategie gleich bestrafen und nichts unterscheiden.
    .filter(({ expectedSources }) => expectedSources.some((source) => !INTERNAL_DOCUMENTS.includes(source)))
    .map(({ id, question, keyPoint, expectedSources }) => ({
      description: id,
      vars: { query: question, keyPoint, expectedSources: expectedSources.join(', ') },
    }));
}
