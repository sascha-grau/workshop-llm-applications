// Lektion 06 – Hybrid-Suche und Reranking, Teil 1: Den Index in Qdrant laden
//
// Lernziel: Du lädst die Indizes aus Lektion 04 in eine Vektordatenbank (Qdrant) und legst neben den
// Vektoren einen Volltextindex mit BM25 an. Beides zusammen ist die Grundlage der Hybrid-Suche.
//
// Bisher war der "Vektorspeicher" eine JSON-Datei, die jedes Programm ganz in den Speicher lädt und
// Chunk für Chunk vergleicht. Eine Vektordatenbank hält die Vektoren dauerhaft, durchsucht sie mit
// einem Index statt mit einem Vergleich gegen jeden Eintrag und kann zusätzlich Volltextsuche. Das
// Programm bettet nichts neu ein: Es übernimmt die fertigen Vektoren aus den Indexdateien. Jeder der
// vier Indizes aus Lektion 04 (`prepared`, `headings`, `semantic`, `questions`) bekommt eine eigene
// Collection; fehlt eine Indexdatei, überspringt das Programm sie mit einem Hinweis. Je Index:
//   1. Index laden: die Datei aus Lektion 04, Teil 1 bis 4. Die weiteren Teile dieser Lektion
//      suchen standardmäßig im Überschriften-Index (Teil 2), wie Lektion 05.
//   2. Collection anlegen: Eine Collection ist in Qdrant das, was eine Tabelle in einer Datenbank
//      ist. Die Vektorgröße (Dimension) kommt aus der Indexdatei, die Distanz ist Kosinus wie bisher.
//      Eine vorhandene Collection gleichen Namens wird vorher gelöscht.
//   3. Volltextindex anlegen: auf dem Feld `text`, mit deutschem Stemmer und deutschen Stoppwörtern.
//   4. Punkte schreiben: Ein Punkt ist ein Eintrag mit ID, Vektor und Payload (Chunk-Text und
//      Metadaten). Im Fragen-Index ist jeder Eintrag eine generierte Frage; sie steht mit in der
//      Payload (`generatedQuestion`), mehrere Punkte teilen sich also einen Chunk-Text.
//   5. Prüfen: Zahl der Punkte, Einstellungen des Volltextindex und die Felder eines Punkts.
//
// BM25: ein klassisches Verfahren der Volltextsuche. Es zählt, wie oft die Wörter der Frage in einem
// Chunk vorkommen, gewichtet seltene Wörter höher und gleicht die Länge des Chunks aus. Es findet
// genaue Begriffe (z. B. "LoRA" oder "RAG"), die ein Embedding verwischen kann.
// Stemmer: führt Wortformen auf einen Stamm zurück, sodass "Maßnahmen" und "Maßnahme" denselben
// Begriff ergeben. Snowball ist der Name eines verbreiteten, regelbasierten Stemming-Verfahrens
// mit Regeln je Sprache. Stoppwörter ("die", "der", "und") zählen nicht mit.
//
// Merke: Eine Collection ist eine Kopie ihrer Indexdatei, kein Ersatz für Lektion 04. Ändert sich
// eine Indexdatei (neue Chunks, anderes Modell), lade sie hier neu. Burp sieht die Anfragen an Qdrant
// nicht: Der Qdrant-Client nutzt einen eigenen Verbindungspool (siehe hybrid.ts).
//
// Voraussetzungen: Qdrant läuft (`docker run -d --name qdrant -p 127.0.0.1:6333:6333
// qdrant/qdrant:v1.20.0`, Adresse `QDRANT_URL` in .env). Die Adresse 127.0.0.1 hält Qdrant
// im eigenen Rechner, denn es hat hier keine Anmeldung; die feste Version v1.20.0 passt zum Client
// und ist nötig, weil der BM25-Volltextindex mit `scoring: true` ein aktuelles Qdrant braucht.
// Mindestens der Index aus Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann
// `npm run l04:2`); die anderen Indizes erzeugen `npm run l04:1`, `l04:3` und `l04:4`. LM Studio, Chat-Modell und Open WebUI braucht dieser Teil nicht.
// Start: npm run l06:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Öffne das Dashboard (<QDRANT_URL>/dashboard, z. B. http://localhost:6333/dashboard) und sieh
//      dir die Collections an: Welche Felder hat die Payload eines Punkts, und worin unterscheiden
//      sich die Punkte der Collection `questions__…` von denen der anderen?
//   2. Starte das Programm ein zweites Mal. Warum bleibt die Zahl der Punkte je Collection gleich,
//      statt sich zu verdoppeln?
//   3. Setze in `TEXT_INDEX` die Sprache des Stemmers auf `english` und lade neu. Suche im Dashboard
//      (Tab "Search" mit einem Filter auf `text`) nach "Maßnahme": Werden Chunks mit "Maßnahmen"
//      noch gefunden?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { logInvocation } from '../shared/logging.ts';
import { indexCommands, indexFileFor, readIndex, type IndexEntry, type Strategy } from '../shared/index.ts';
import { getQdrantClient, requireQdrant, collectionNameFor } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// NEU: Der Volltextindex auf dem Feld `text`. `word` trennt an Leerzeichen und Satzzeichen, der
// Snowball-Stemmer (regelbasiertes Stemming-Verfahren, siehe oben) kürzt deutsche Wortformen auf ihren Stamm, `scoring: true` speichert, was BM25
// zum Rechnen braucht.
const TEXT_INDEX = {
  type: 'text',
  tokenizer: 'word',
  stemmer: { type: 'snowball', language: 'german' },
  stopwords: 'german',
  scoring: true,
} as const;
// NEU: Die Indizes, die geladen werden: alle vier aus Lektion 04, in der Reihenfolge ihrer Teile.
const STRATEGIES = Object.keys(indexCommands) as Strategy[];

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt, sieht aber keinen Aufruf dieser Datei:
  // Der Qdrant-Client umgeht den globalen Dispatcher (siehe hybrid.ts).
  useBurpIfConfigured();

  await requireQdrant();

  for (const strategy of STRATEGIES) {
    // Schritt 1: Index laden. Die Vektoren liegen fertig in der Datei; kein Chunk wird neu eingebettet.
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

// Schritt 2 bis 5 für einen Index: Collection anlegen, Volltextindex, Punkte schreiben, prüfen.
async function loadCollection(strategy: Strategy, entries: IndexEntry[]) {
  const collectionName = collectionNameFor(strategy);
  // Die Dimension kommt aus der Datei, so passt die Collection zu jedem Embedding-Modell.
  const dimension = entries[0].vector.length;
  console.log(`Index ${strategy}: ${entries.length} entries from ${indexFileFor(strategy)}, dimension ${dimension}`);

  await logInvocation('Qdrant', { collection: collectionName, pointCount: entries.length }, async () => {
    // NEU: Schritt 2: Collection neu anlegen. Löschen und neu anlegen statt ergänzen: So bleiben keine
    // Punkte, keine alte Dimension und kein alter Volltextindex eines früheren Laufs liegen.
    if ((await getQdrantClient().collectionExists(collectionName)).exists) await getQdrantClient().deleteCollection(collectionName);
    await getQdrantClient().createCollection(collectionName, { vectors: { size: dimension, distance: 'Cosine' } });

    // NEU: Schritt 3: Volltextindex mit BM25, im selben Dienst wie die Vektoren.
    await getQdrantClient().createPayloadIndex(collectionName, { field_name: 'text', field_schema: TEXT_INDEX, wait: true });

    // NEU: Schritt 4: Punkte schreiben. `upsert` heißt "update or insert": Existiert ein Punkt mit
    // dieser ID schon, wird er überschrieben, sonst neu angelegt. Die ID ist die Position in der
    // Indexdatei; die Payload enthält alles außer dem Vektor: Chunk-Text, Metadaten und im
    // Fragen-Index die generierte Frage.
    await getQdrantClient().upsert(collectionName, {
      wait: true,
      points: entries.map(({ vector, metadata, ...rest }, id) => ({ id, vector, payload: { ...rest, ...metadata } })),
    });

    // Schritt 5: Prüfen, was Qdrant jetzt hält.
    const collection = await getQdrantClient().getCollection(collectionName);
    console.log(`Collection ${collectionName}: ${collection.points_count} points from ${entries.length} index entries`);
    console.log(`Full-text index on text: ${JSON.stringify(collection.payload_schema.text?.params)}`);
    const { points: [example] } = await getQdrantClient().scroll(collectionName, { limit: 1, with_payload: true });
    console.log(`Payload fields of point #${example.id}: ${Object.keys(example.payload ?? {}).join(', ')}`);
  });
}

// Lädt einen Index aus Lektion 04. Fehlt die Datei oder ist sie veraltet, wird er übersprungen: Die
// Meldung sagt, welche npm-Skripte ihn erzeugen, und die anderen Indizes laden trotzdem.
function loadIndex(strategy: Strategy): IndexEntry[] | undefined {
  try {
    return readIndex(strategy);
  } catch (error) {
    console.log(`Skipping ${strategy}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
