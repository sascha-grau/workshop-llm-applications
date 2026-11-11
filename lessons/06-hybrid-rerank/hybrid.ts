// Gemeinsame Hilfsfunktionen für Lektion 06 (erstmals in 01-collection-load.ts benutzt): alles, was
// in allen Teilen identisch sein muss, damit sie dieselbe Qdrant-Collection lesen. Hier liegen:
// der Collection-Name, der Qdrant-Client und die Prüfungen, ob Qdrant und die Collection da sind.
//
// Client und Collection-Name sind absichtlich Funktionen (`getQdrantClient`, `getCollectionName`)
// und keine Konstanten auf Modulebene: Sie lesen die Einstellungen (`QDRANT_URL`, Embedding-Modell)
// erst beim Aufruf, nicht schon beim Import. Eine fehlende oder fehlerhafte Einstellung wirft dann
// innerhalb von `main()` und erscheint über `runMain` als einzeilige Fehlermeldung, statt beim
// Import als Stacktrace.
import { QdrantClient } from '@qdrant/js-client-rest';
import { settings } from '../shared/config.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import type { Strategy } from '../shared/index.ts';

// Wie die Indexdatei (`indexFileFor` in shared/index.ts) trägt der Name Strategie und Modell: Jeder
// Index aus Lektion 04 bekommt eine eigene Collection, und ein anderes Embedding-Modell auch, statt
// Vektoren zu vermischen. Zeichen, die Qdrant in Namen nicht mag (z. B. "/"), werden ersetzt.
export const collectionNameFor = (strategy: Strategy) =>
  `${strategy}__${remoteEmbeddingModel.name.replace(/[^\w.-]/g, '_')}`;

// Die Collection, die die Suche in dieser Lektion standardmäßig nutzt: der Überschriften-Index aus
// Lektion 04, Teil 2, derselbe wie in Lektion 05.
export const INDEX_STRATEGY = 'headings';
export const getCollectionName = () => collectionNameFor(INDEX_STRATEGY);

// Der Qdrant-Client spricht die REST-Schnittstelle an (`QDRANT_URL` in .env). Er bringt sein eigenes
// undici mit eigenem Dispatcher mit: `useBurpIfConfigured()` erreicht ihn nicht, Burp sieht seine
// Anfragen also nicht. Was in Qdrant liegt, zeigt das Dashboard unter <QDRANT_URL>/dashboard.
let client: QdrantClient | undefined;
export function getQdrantClient(): QdrantClient {
  return client ??= new QdrantClient({ url: settings.qdrantURL.replace(/\/+$/, '') });
}

// Prüft vor der ersten echten Anfrage, ob Qdrant antwortet, mit einer Meldung, die sagt, was zu tun ist.
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

// Prüft, ob Qdrant läuft und die Collection existiert (Teil 2 und folgende lesen nur, Teil 1 lädt).
export async function requireCollection(collectionName: string): Promise<void> {
  await requireQdrant();
  if (!(await getQdrantClient().collectionExists(collectionName)).exists) {
    throw new Error(`The Qdrant collection ${collectionName} does not exist. Load it with npm run l06:1.`);
  }
}
