// Lektion 06 – Hybrid-Suche und Reranking, Teil 1: Die Indizes in Qdrant laden
//
// Lernziel: Die fertigen Vektoren aus Lektion 04 in Qdrant laden, mit einem BM25-Volltextindex daneben.
// Braucht:  Qdrant (README.de.md#qdrant-einrichten); Index `headings` aus `npm run l04:2`, die
//           übrigen Indizes optional. Kein LM Studio.
// Schreibt: je Index eine Collection; Teil 2 bis 7 suchen nur in `headings__…`.
// Start:    npm run l06:1   (oder F5)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. Öffne <QDRANT_URL>/dashboard: Welche Felder hat die Payload eines Punkts? Was ist in
//      `questions__…` anders?
//   2. Sage vorher, ob sich die Zahl der Punkte beim zweiten Start verdoppelt. Prüfe es dann.
//   3. Setze in `TEXT_INDEX` die Sprache des Stemmers auf `english`, lade neu und suche im Dashboard
//      (Filter auf `text`) nach "Maßnahme": Findet es noch "Maßnahmen"?
//      ↺ Danach zurück auf `german` und `npm run l06:1` (sonst sucht BM25 in Teil 2 bis 7 englisch).
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Handwerk.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { logInvocation } from '../shared/logging.ts';
import { indexCommands, indexFileFor, readIndex, type IndexEntry, type Strategy } from '../shared/index.ts';
import { getQdrantClient, requireQdrant, collectionNameFor } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: deutscher Stemmer und deutsche Stoppwörter, passend zum Korpus. `scoring: true` speichert,
// was BM25 zum Rechnen braucht, und braucht ein aktuelles Qdrant.
const TEXT_INDEX = {
  type: 'text',
  tokenizer: 'word',
  stemmer: { type: 'snowball', language: 'german' },
  stopwords: 'german',
  scoring: true,
} as const;
const STRATEGIES = Object.keys(indexCommands) as Strategy[];

async function main() {
  // Burp sieht in dieser Datei nichts: Der Qdrant-Client umgeht ihn (`getQdrantClient` in hybrid.ts).
  useBurpIfConfigured();

  await requireQdrant();

  for (const strategy of STRATEGIES) {
    // KERN 1: Die Vektoren liegen fertig in der Indexdatei; kein Chunk wird neu eingebettet.
    const entries = loadIndex(strategy);
    if (!entries) continue;
    try {
      await loadCollection(strategy, entries);
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }
}

async function loadCollection(strategy: Strategy, entries: IndexEntry[]) {
  const collectionName = collectionNameFor(strategy);
  const dimension = entries[0].vector.length;
  console.log(`Index ${strategy}: ${entries.length} entries from ${indexFileFor(strategy)}, dimension ${dimension}`);

  await logInvocation('Qdrant', { collection: collectionName, pointCount: entries.length }, async () => {
    // KERN 2: Löschen und neu anlegen statt ergänzen: So bleiben keine Punkte, keine alte Dimension
    // und kein alter Volltextindex eines früheren Laufs liegen. Die Dimension kommt aus der Datei.
    if ((await getQdrantClient().collectionExists(collectionName)).exists) await getQdrantClient().deleteCollection(collectionName);
    await getQdrantClient().createCollection(collectionName, { vectors: { size: dimension, distance: 'Cosine' } });

    // KERN 3: Volltextindex mit BM25, in derselben Collection wie die Vektoren.
    await getQdrantClient().createPayloadIndex(collectionName, { field_name: 'text', field_schema: TEXT_INDEX, wait: true });

    // KERN 4: Punkte schreiben. ID = Position in der Indexdatei; die Payload ist alles außer dem
    // Vektor. `upsert` = "update or insert".
    await getQdrantClient().upsert(collectionName, {
      wait: true,
      points: entries.map(({ vector, metadata, ...rest }, id) => ({ id, vector, payload: { ...rest, ...metadata } })),
    });

    const collection = await getQdrantClient().getCollection(collectionName);
    console.log(`Collection ${collectionName}: ${collection.points_count} points from ${entries.length} index entries`);
    console.log(`Full-text index on text: ${JSON.stringify(collection.payload_schema.text?.params)}`);
    const { points: [example] } = await getQdrantClient().scroll(collectionName, { limit: 1, with_payload: true });
    console.log(`Payload fields of point #${example.id}: ${Object.keys(example.payload ?? {}).join(', ')}`);
  });
}

// Ein fehlender oder veralteter Index wird übersprungen, statt abzubrechen; die anderen laden trotzdem.
function loadIndex(strategy: Strategy): IndexEntry[] | undefined {
  try {
    return readIndex(strategy);
  } catch (error) {
    console.log(`Skipping ${strategy}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

await runMain(main);
