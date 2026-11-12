// Lektion 08 – Evaluierung: die Wertung je Zelle für Teil 5 (`defaultTest.assertScoringFunction`), kein
// eigener Teil.
//
// `scoreCell` rechnet das Ergebnis einer Zelle aus den Einzelprüfungen wie promptfoo selbst: bestanden,
// wenn alle bestehen (oder, hat der Testfall eine `threshold`, wenn die Wertung sie erreicht), die
// Wertung ist der gewichtete Mittelwert. Neu ist nur, dass die Funktion die Begründung jeder Prüfung
// (z. B. die Liste der Aussagen aus `promptfoo-faithfulness.ts`) in die Zelle schreibt, damit der
// statische HTML-Bericht sie zeigt. Sie versteht nur flache Prüfungen: `assert-set` und `guardrails` lehnt sie mit einer Meldung ab,
// weil promptfoo ihr nur die abgeflachten Ergebnisse gibt. Zum Verstehen der Lektion nicht nötig.

import type { GradingResult } from 'promptfoo';

export default function scoreCell(
  _scores: Record<string, number>, context: { componentResults: GradingResult[]; threshold?: number; parentAssertionSet?: unknown },
): GradingResult {
  if (context.parentAssertionSet || context.componentResults.some((result) =>
    result.componentResults || result.metadata?.assertionSet || ['assert-set', 'guardrails'].includes(result.assertion?.type ?? ''))) {
    throw new Error('scoreCell supports flat assertions only; nested assert-set and guardrails results are not supported. Remove assertScoringFunction to use promptfoo aggregation for these checks.');
  }
  let total = 0;
  let weightSum = 0;
  for (const result of context.componentResults) {
    const weight = result.assertion?.weight ?? 1;
    total += result.score * weight;
    weightSum += weight;
  }
  const score = Number.isFinite(total) && Number.isFinite(weightSum) ? weightSum > 0 ? total / weightSum : 0 : NaN;
  const pass = typeof context.threshold === 'number' && !Number.isNaN(context.threshold)
    ? score >= context.threshold
    : context.componentResults.every((result) => result.pass);
  return {
    pass,
    score,
    reason: context.componentResults.map((result) => `${result.assertion?.metric ?? 'assertion'}: ${result.reason}`).join('\n'),
  };
}
