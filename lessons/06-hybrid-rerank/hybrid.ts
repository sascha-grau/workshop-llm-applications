// Hilfsmodul für Lektion 06: Collection-Namen, Qdrant-Client, Prüfungen auf Qdrant und Collection.
// Client und Name sind Funktionen statt Konstanten: Eine fehlende Einstellung wirft erst in `main()`
// und erscheint als einzeilige Meldung statt als Stacktrace beim Import.
// Qdrant einrichten: README.de.md#qdrant-einrichten. Erklärt: lessons/06-hybrid-rerank/GUIDE.de.md
import { QdrantClient } from '@qdrant/js-client-rest';
import { settings } from '../shared/config.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import type { Strategy } from '../shared/index.ts';

// Name aus Strategie und Modell wie die Indexdatei: Ein anderes Embedding-Modell bekommt eine eigene
// Collection, statt Vektoren zu vermischen. Zeichen, die Qdrant in Namen nicht mag, werden ersetzt.
export const collectionNameFor = (strategy: Strategy) =>
  `${strategy}__${remoteEmbeddingModel.name.replace(/[^\w.-]/g, '_')}`;

// Standard: 'headings'. Teil 1 lädt alle vier Indizes, gesucht wird nur in dieser Collection. Wirkt
// über Lektion 06 hinaus und ist nicht die Konstante aus Lektion 05: docs/architecture.de.md#namensfallen.
export const INDEX_STRATEGY = 'headings';
export const getCollectionName = () => collectionNameFor(INDEX_STRATEGY);

// Der Client bringt eigenes undici mit eigenem Dispatcher mit: `useBurpIfConfigured()` erreicht ihn
// nicht, Burp sieht Anfragen an Qdrant also nie. Den Inhalt zeigt <QDRANT_URL>/dashboard.
let client: QdrantClient | undefined;
export function getQdrantClient(): QdrantClient {
  return client ??= new QdrantClient({ url: settings.qdrantURL.replace(/\/+$/, '') });
}

export async function requireQdrant(): Promise<void> {
  try {
    await getQdrantClient().getCollections();
  } catch (cause) {
    throw new Error(
      `Qdrant is not reachable at ${settings.qdrantURL}. Start it (docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0) or fix QDRANT_URL in .env.`,
      { cause },
    );
  }
}

export async function requireCollection(collectionName: string): Promise<void> {
  await requireQdrant();
  if (!(await getQdrantClient().collectionExists(collectionName)).exists) {
    throw new Error(`The Qdrant collection ${collectionName} does not exist. Load it with npm run l06:1.`);
  }
}
