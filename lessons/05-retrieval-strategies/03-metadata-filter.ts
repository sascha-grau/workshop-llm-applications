// Lektion 05 – Retrieval-Strategien, Teil 3: Metadaten-Filter
//
// Lernziel: Ein Filter entscheidet, was gefunden werden darf; Zugriffsrechte gehören vor die Suche.
// Braucht:  wie Teil 1 (Index `headings`, LM Studio mit E5).
// Start:    npm run l05:3   (oder F5)
// Erklärt:  lessons/05-retrieval-strategies/GUIDE.de.md → „Teil 3“
//
// Aufgabe:
//   1. Welche Treffer von `no filter` dürfte ein Gast nicht sehen? Wie viele bleiben beim Post-Filter?
//   2. Setze `QUESTION` auf 'Wie begrenze ich Prompt Injection?' und vergleiche `access groups public`
//      mit `mitigation sections`: Welche Abschnitte fallen weg?
//      ↺ Danach zurücksetzen: `QUESTION` auf 'Welche Unternehmen sind Sponsoren des Projekts?'.
//   3. Setze `ALLOWED_ACCESS_GROUPS` auf ['public', 'internal'] (Mitarbeiterin statt Gast): Was kommt
//      beim Zugriffsfilter hinzu?  ↺ Danach zurücksetzen: `ALLOWED_ACCESS_GROUPS` auf ['public'].
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, isPublicChunk, rankEntries, sectionPath, type ChunkMetadata } from '../shared/index.ts';
import { loadIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 'Welche Unternehmen sind Sponsoren des Projekts?'. Zielt auf den Anhang, der als intern
// gilt (`INTERNAL_DOCUMENTS` in shared/index.ts).
const QUESTION = 'Welche Unternehmen sind Sponsoren des Projekts?';
// Standard: 3 Chunks, die am Ende in den Prompt kämen.
const TOP_K = 3;
// Standard: ['public'] (ein Gast); ['public', 'internal'] wäre eine Mitarbeiterin.
// VEREINFACHT: Konstante statt Anmeldung. In echt leitet der Server sie aus der Identität ab, nie aus
// Anfrage, Chat-Text oder Modellantwort; sonst wählt sich ein Angreifer seine Rechte selbst.
const ALLOWED_ACCESS_GROUPS: ChunkMetadata['accessGroup'][] = ['public'];
// Im Zweifel draußen: Öffentlich ist nur, was "public" trägt und nicht auf der Liste interner
// Dokumente steht (`isPublicChunk`). Alles andere zählt als "internal", auch ein falsch beschrifteter
// Chunk. Fehlt die Gruppe ganz, lehnt schon `readIndex` den Index ab.
const accessGroupOf = (metadata: ChunkMetadata): ChunkMetadata['accessGroup'] =>
  isPublicChunk(metadata) ? 'public' : 'internal';
// KERN 1: Der Zugriffsfilter sieht nur Metadaten, nie Text oder Vektor, und sagt ja oder nein.
// Jeder weitere Filter baut auf ihm auf (`mayRead(metadata) && …`), nie an ihm vorbei.
const mayRead = (metadata: ChunkMetadata) => ALLOWED_ACCESS_GROUPS.includes(accessGroupOf(metadata));
const ACCESS_FILTER = `access groups ${ALLOWED_ACCESS_GROUPS.join('+')}`;
const FILTERS: Record<string, (metadata: ChunkMetadata) => boolean> = {
  // Nur zum Vergleich: Diese Tabelle zeigt absichtlich interne Dateien. In einer echten Anwendung
  // gibt es keine Suche ohne Zugriffsfilter.
  'no filter': () => true,
  // Mit ['public'] genau der Filter aus Teil 1, 2 und 4 (`loadPublicIndex`).
  [ACCESS_FILTER]: mayRead,
  // `headingPath[0]` ist der Dokumenttitel, `headingPath[1]` die Überschrift darunter.
  'mitigation sections': (metadata) =>
    mayRead(metadata) && metadata.headingPath?.[1] === 'Präventions- und Mitigationsstrategien',
};
// Für diesen Filter zeigt das Programm zusätzlich die Tabelle des Post-Filters.
const POST_FILTER_EXAMPLE = ACCESS_FILTER;

async function main() {
  useBurpIfConfigured();

  // Diesmal der ganze Index, auch intern: Hier filtert das Programm selbst.
  const index = loadIndex();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      const unfilteredHits = withRank(rankEntries(index, queryVector, TOP_K));

      for (const [name, filter] of Object.entries(FILTERS)) {
        // KERN 2: Pre-Filter. Erst die Metadaten prüfen, dann nur im Rest suchen.
        const allowed = index.filter(({ metadata }) => filter(metadata));
        const hits = withRank(rankEntries(allowed, queryVector, TOP_K));
        // KERN 3: Post-Filter. Erst suchen, dann streichen; es rückt nichts nach.
        const postFilterHits = unfilteredHits.filter(({ metadata }) => filter(metadata));

        // Lehrausgabe für Entwickler. Einem Nutzer dürftest du weder zeigen, wie viele Chunks für ihn
        // gesperrt sind, noch wie viele Treffer gestrichen wurden.
        console.log(
          `Filter “${name}” for “${QUESTION}”: ${allowed.length} of ${index.length} chunks searchable,` +
          ` pre-filter returns ${hits.length} hits, post-filter would return ${postFilterHits.length}`,
        );
        printFilterHits(`${name} (pre-filter)`, hits);
        // Die Treffer behalten ihren Rang aus der ungefilterten Suche: Lücken zeigen, was gestrichen wurde.
        if (name === POST_FILTER_EXAMPLE) printFilterHits(`${name} (post-filter)`, postFilterHits);
      }
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

function withRank<T>(hits: T[]) {
  return hits.map((hit, position) => ({ ...hit, rank: position + 1 }));
}

function printFilterHits(filter: string, hits: { metadata: ChunkMetadata; similarity: number; rank: number }[]) {
  console.table(hits.map(({ metadata, similarity, rank }) => ({
    filter,
    rank,
    similarity: similarity.toFixed(3),
    'access group': metadata.accessGroup,
    file: metadata.source,
    section: sectionPath(metadata.headingPath),
  })));
}

await runMain(main);
