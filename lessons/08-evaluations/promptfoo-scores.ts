// Lektion 08 – Evaluierung: die Wertung je Zelle für Teil 5 (`defaultTest.assertScoringFunction`),
// kein eigener Teil. Rechnet wie promptfoo selbst, schreibt aber die Begründung jeder Prüfung in die
// Zelle, damit der statische HTML-Bericht sie zeigt. Erklärt: GUIDE.de.md → „Teil 5“.
import type { GradingResult } from 'promptfoo';

export default function scoreCell(
  _scores: Record<string, number>, context: { componentResults: GradingResult[]; threshold?: number; parentAssertionSet?: unknown },
): GradingResult {
  // promptfoo gibt hier nur abgeflachte Ergebnisse; verschachtelte Prüfungen würden falsch gewertet.
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
  // Wie promptfoo: Mit `threshold` am Testfall zählt die Wertung, sonst müssen alle Prüfungen bestehen.
  const pass = typeof context.threshold === 'number' && !Number.isNaN(context.threshold)
    ? score >= context.threshold
    : context.componentResults.every((result) => result.pass);
  return {
    pass,
    score,
    reason: context.componentResults.map((result) => `${result.assertion?.metric ?? 'assertion'}: ${result.reason}`).join('\n'),
  };
}
