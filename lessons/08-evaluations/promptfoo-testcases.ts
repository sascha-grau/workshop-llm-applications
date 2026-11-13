// Lektion 08 – Evaluierung: Testfälle für promptfoo (Teil 5 und 6), kein eigener Teil. Übersetzt das
// Fragen-Set aus Lektion 05 (die eine Quelle der Wahrheit) in `query`, `keyPoint`, `expectedSources`.
// `expectedSources` ist Text mit ", ": Eine Liste würde promptfoo in einen Testfall je Eintrag aufspalten.
import { INTERNAL_DOCUMENTS } from '../shared/index.ts';
import { loadQuestionSet } from '../05-retrieval-strategies/retrieval.ts';

export default function testCases() {
  return loadQuestionSet().questions
    // Ohne F-11 (nur im internen Anhang): Der Assistent sucht nur öffentlich. Als Fehlschlag würde sie
    // jede Strategie gleich bestrafen und nichts unterscheiden.
    .filter(({ expectedSources }) => expectedSources.some((source) => !INTERNAL_DOCUMENTS.includes(source)))
    .map(({ id, question, keyPoint, expectedSources }) => ({
      description: id,
      vars: { query: question, keyPoint, expectedSources: expectedSources.join(', ') },
    }));
}
