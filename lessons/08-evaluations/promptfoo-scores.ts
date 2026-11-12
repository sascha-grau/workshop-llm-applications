// Lektion 08 – Evaluierung: die Wertung je Zelle für Teil 5 (`defaultTest.assertScoringFunction`), kein
// eigener Teil.
//
// promptfoo rechnet das Ergebnis einer Zelle aus den Einzelprüfungen: bestanden, wenn alle bestehen, die
// Wertung ist der gewichtete Mittelwert. Genau das macht diese Funktion auch. Neu ist nur, dass sie die
// Begründung jeder Prüfung (z. B. die Liste der Aussagen aus `promptfoo-faithfulness.ts`) in die Zelle
// schreibt, damit der statische HTML-Bericht sie zeigt. Zum Verstehen der Lektion nicht nötig.

import type { GradingResult } from 'promptfoo';

export default function reportFaithfulness(
  _scores: Record<string, number>, context: { componentResults: GradingResult[]; threshold?: number },
): GradingResult {
  let total = 0;
  let weightSum = 0;
  for (const result of context.componentResults) {
    const weight = result.assertion?.weight ?? 1;
    total += result.score * weight;
    weightSum += weight;
  }
  const score = weightSum > 0 ? total / weightSum : 0;
  const pass = context.threshold === undefined
    ? context.componentResults.every((result) => result.pass)
    : score >= context.threshold;
  return {
    pass,
    score,
    reason: context.componentResults.map((result) => `${result.assertion?.metric ?? 'assertion'}: ${result.reason}`).join('\n'),
  };
}
