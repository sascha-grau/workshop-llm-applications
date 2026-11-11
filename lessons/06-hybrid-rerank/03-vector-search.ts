// Lektion 06 – Hybrid-Suche und Reranking, Teil 3: Vektorsuche in Qdrant, neben BM25
//
// Lernziel: Du suchst in Qdrant mit Vektoren und stellst das Ergebnis neben die Keyword-Suche aus
// Teil 2. Du siehst, dass beide Suchen bei verschiedenen Fragen versagen und sich daher ergänzen.
//
// Die Vektorsuche ist dieselbe wie in Lektion 05, Teil 1: Kosinus-Ähnlichkeit zwischen Fragevektor
// und jedem Chunk. Neu ist nur, dass Qdrant rechnet statt einer Schleife im Programm. Schritte:
//   0. Vom Text zum Vektor (für `VECTOR_EXAMPLE_QUESTION`): Die Frage geht an das Embedding-Modell,
//      zurück kommt eine Liste von Zahlen. Nur diese Liste geht an Qdrant, nicht der Text; Qdrant
//      kennt kein Embedding-Modell und vergleicht nur Zahlen. Das Programm zeigt beide Anfragen.
// Danach je Frage in `QUESTIONS` (Schritt 1 bis 3):
//   1. Keyword-Suche: BM25 im Volltextindex, wie in Teil 2.
//   2. Vektorsuche: Frage einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor),
//      und Qdrant die ähnlichsten Punkte suchen lassen.
//   3. Vergleichen: Die Tabelle zeigt je Rang den Treffer beider Suchen nebeneinander, als
//      "#Punkt Dokument Wert".
//   4. Filter aus der Frage (für `VERSION_QUESTIONS`): Nennt die Frage eine Jahreszahl ("OWASP 2024"),
//      wird sie zum Metadaten-Filter auf `version` (wie in Lektion 05, Teil 3), und eingebettet wird
//      nur der Rest der Frage. Dieselbe Vektorsuche läuft einmal ohne und einmal mit Filter.
//
// Merke: Die Vektorsuche vergleicht Bedeutung und braucht kein gemeinsames Wort. Sie liefert aber
// immer `TOP_K` Treffer, auch für ein Wort wie "PoisonGPT": Findet sie den passenden Chunk, liegt er
// oft nur knapp vor unpassenden, der Abstand sagt kaum etwas. BM25 setzt einen genauen Begriff
// deutlich nach vorn und schweigt, wenn kein Wort passt; bei einer umgangssprachlichen Frage zählen
// dafür nur wenige Wörter. Keine der beiden Suchen ist allein verlässlich. Die beiden Werte sind
// nicht vergleichbar (BM25 nach oben offen, Kosinus bei E5 meist 0,7 bis 0,9); Teil 4 kombiniert
// die beiden Listen deshalb über die Ränge, nicht über die Werte.
// Eine Jahreszahl in der Frage verschiebt den Fragevektor nur ein wenig; das Embedding weiß nicht,
// dass "2024" eine Ausgabe meint. Als Filter ist sie eine harte Regel. Der Korpus enthält nur die
// Ausgabe 2025: Der Filter auf 2024 lässt keinen Chunk übrig, und die ehrliche Antwort ist "dazu
// gibt es keine Dokumente", nicht die ähnlichsten Treffer aus 2025.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und Teil 1 hat die Collections geladen
// (`npm run l06:1`); LM Studio läuft mit gestartetem Server und geladenem E5-Modell. Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l06:3   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die beiden Spalten für "PoisonGPT": Welche Suche findet das Szenario, in dem der
//      Begriff vorkommt, und was liefert die andere?
//   2. Vergleiche die Spalten für die umgangssprachliche Frage: Wie viele Treffer beider Suchen
//      stammen aus `02-llm02-offenlegung-sensibler-informationen.md`?
//   3. Ergänze in `QUESTIONS` eine Frage, in der ein Fachbegriff und eine Umschreibung vorkommen
//      (z. B. "Wie schütze ich mich vor Slopsquatting, wenn mein Assistent Pakete vorschlägt?").
//      Welche Treffer stehen in beiden Spalten?
//   4. Lies die Ausgabe von Schritt 0: Wie viele Zahlen hat der Fragevektor, und welches Wort der
//      Frage findest du in der Anfrage an Qdrant wieder?
//   5. Vergleiche die Suchen zu den beiden Fragen in `VERSION_QUESTIONS` (Schritt 4): Was liefert
//      der Filter auf 2024, was der auf 2025, und wie unterscheidet sich 2025 von der Suche ohne
//      Filter?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import type { Schemas } from '@qdrant/js-client-rest';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Dieselben Fragen wie in Teil 2: ein seltener Fachbegriff und eine umgangssprachliche Frage.
const QUESTIONS = [
  'PoisonGPT',
  'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?',
];
// Wie viele Chunks jede Suche höchstens liefert.
const TOP_K = 5;
// NEU: Die Frage für Schritt 0, an der der Weg vom Text zum Vektor gezeigt wird.
const VECTOR_EXAMPLE_QUESTION = 'Wie verhindere ich, dass mein Chatbot vertrauliche Daten verrät?';
// Wie viele Zahlen des Vektors die Ausgabe zeigt; der Rest wird abgekürzt.
const VECTOR_PREVIEW_LENGTH = 6;
// NEU: Dieselbe Frage für zwei Ausgaben der OWASP-Liste. Die Jahreszahl wird zum Filter auf das
// Metadatenfeld `version` (Schritt 4): 2024 gibt es im Korpus nicht, 2025 schon.
const VERSION_QUESTIONS = [
  'Welche Risiken nennt OWASP 2024 für die Lieferkette?',
  'Welche Risiken nennt OWASP 2025 für die Lieferkette?',
];
// Eine Jahreszahl als eigenes Wort, z. B. "2024". Sie gilt als Angabe der Version.
const VERSION_PATTERN = /\b(20\d{2})\b/;

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht alle Chunks, auch den internen Anhang. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02/LLM08).
async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er sieht die Anfragen an das
  // Embedding-Modell, aber nicht die an Qdrant (siehe hybrid.ts).
  useBurpIfConfigured();

  await requireCollection(getCollectionName());
  await checkModelServer({ viaBurp: true });

  // NEU: Schritt 0: Vom Text zum Vektor.
  try {
    await logInvocation('Vector example', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question: VECTOR_EXAMPLE_QUESTION }, async () => {
      // Anfrage 1 an das Embedding-Modell (LM Studio): Text hinein, Vektor heraus. Burp sieht sie.
      const input = embeddingQuery(VECTOR_EXAMPLE_QUESTION);
      const queryVector = await embeddings.embedQuery(input);
      console.log(`1. To the embedding model ${remoteEmbeddingModel.name}: “${input}”`);
      console.log(`   Back: a vector with ${queryVector.length} numbers: ${previewVector(queryVector)}`);

      // Anfrage 2 an Qdrant: nur der Vektor, kein Text. So sähe der Rumpf der REST-Anfrage aus
      // (POST /collections/<Name>/points/query), mit abgekürztem Vektor.
      const request = { query: queryVector, limit: TOP_K, with_payload: true };
      console.log(`2. To Qdrant, collection ${getCollectionName()}:`);
      console.log(`   ${JSON.stringify({ ...request, query: previewVector(queryVector) })}`);
      const { points } = await getQdrantClient().query(getCollectionName(), request);
      console.table(points.map((hit, position) => ({ rank: position + 1, hit: describeHit(hit) })));
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question }, async () => {
        // Schritt 1: Keyword-Suche, wie in Teil 2.
        const keyword = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: TOP_K, with_payload: true });

        // NEU: Schritt 2: Vektorsuche. Statt `{ text }` bekommt `query` den Fragevektor; ohne `using`
        // sucht Qdrant auf den Vektoren der Collection, mit der Distanz aus Teil 1 (Kosinus).
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));
        const vector = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: TOP_K, with_payload: true });

        // Schritt 3: Vergleichen, Rang für Rang. Eine leere Zelle heißt: Diese Suche hat weniger Treffer.
        console.log(`Top ${TOP_K} for “${question}” (#point document score):`);
        console.table(Array.from({ length: TOP_K }, (_unused, position) => ({
          rank: position + 1,
          'keyword (BM25)': describeHit(keyword.points[position]),
          vector: describeHit(vector.points[position]),
        })));
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }

  // NEU: Schritt 4: Filter aus der Frage. Die Jahreszahl wird aus dem Text genommen, der eingebettet
  // wird, und als Filter gesetzt; ohne Jahreszahl läuft nur die Suche ohne Filter.
  for (const question of VERSION_QUESTIONS) {
    const version = VERSION_PATTERN.exec(question)?.[1];
    const searchText = question.replace(VERSION_PATTERN, '').replace(/\s+/g, ' ').trim();
    const filter: Schemas['Filter'] | undefined = version ? { must: [{ key: 'version', match: { value: version } }] } : undefined;
    try {
      await logInvocation('Search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question, version }, async () => {
        const queryVector = await embeddings.embedQuery(embeddingQuery(searchText));
        const unfiltered = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: TOP_K, with_payload: true });
        // Der Filter kommt zur selben Suche hinzu: Qdrant prüft erst die Metadaten, dann vergleicht
        // es den Fragevektor nur mit den übrigen Punkten.
        const filtered = filter
          ? await getQdrantClient().query(getCollectionName(), { query: queryVector, filter, limit: TOP_K, with_payload: true })
          : undefined;

        console.log(`Vector search for “${question}”: version ${version ?? '(none)'}, embedded text “${searchText}”`);
        if (filter) console.log(`Filter: ${JSON.stringify(filter)} → ${filtered!.points.length} of at most ${TOP_K} hits`);
        console.table(Array.from({ length: TOP_K }, (_unused, position) => ({
          rank: position + 1,
          'no filter': describeHit(unfiltered.points[position]),
          ...(filtered ? { [`version ${version}`]: describeHit(filtered.points[position]) } : {}),
        })));
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }
}

// Die ersten Zahlen eines Vektors, gerundet, und wie viele fehlen; der ganze Vektor füllt sonst den
// Bildschirm.
function previewVector(vector: number[]): string {
  const shown = vector.slice(0, VECTOR_PREVIEW_LENGTH).map((value) => value.toFixed(4)).join(', ');
  return `[${shown}, … ${vector.length - VECTOR_PREVIEW_LENGTH} more]`;
}

// Ein Treffer als kurze Zelle: Punkt-ID, Dokument (nur der Anfang des Dateinamens, z. B. "03-llm03")
// und Wert. Ohne Treffer bleibt die Zelle leer.
function describeHit(hit?: { id: string | number; score: number; payload?: unknown }): string {
  if (!hit) return '';
  const { source } = hit.payload as ChunkMetadata;
  return `#${hit.id} ${source.split('-').slice(0, 2).join('-')} ${hit.score.toFixed(3)}`;
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
