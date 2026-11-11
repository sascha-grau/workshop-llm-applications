// Lektion 05 – Retrieval-Strategien, Teil 3: Metadaten-Filter
//
// Lernziel: Du verstehst, wie Metadaten die Suche einschränken: Ein Filter entscheidet, welche
// Chunks überhaupt gefunden werden dürfen, die Ähnlichkeit entscheidet nur noch über die
// Reihenfolge. Du siehst den Unterschied zwischen Filtern vor und nach der Suche.
//
// Teil 1 und 2 haben den Filter auf öffentliche Chunks schon benutzt, ohne ihn zu erklären (Teil 4
// benutzt ihn auch). Hier ist er das Thema: Jeder Chunk trägt seit Lektion 04 Metadaten (Dokument,
// Position, Überschriftenpfad, Zugriffsgruppe; siehe `metadataFor` dort). Die Ähnlichkeitssuche
// kennt sie nicht; sie vergleicht nur Vektoren. Schritte:
//   1. Index laden: der Überschriften-Index aus Lektion 04, Teil 2, diesmal ungefiltert, also
//      auch mit den internen Chunks des Anhangs.
//   2. Frage einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor).
//   3. Vorher filtern (Pre-Filter): Je Eintrag in `FILTERS` bleiben nur die Chunks, deren
//      Metadaten passen; erst danach läuft Top-k (Teil 1) über den Rest.
//   4. Zum Vergleich nachher filtern (Post-Filter): Top-k über alle Chunks, dann die unpassenden
//      Treffer streichen. Die Ausgabe zeigt, wie viele von `TOP_K` Treffern dabei übrig bleiben;
//      für den Filter in `POST_FILTER_EXAMPLE` folgt zusätzlich eine eigene Tabelle.
//
// Merke: Ein Filter ist eine harte Regel, keine Bewertung: Was er ausschließt, kann die Suche nie
// liefern, egal wie gut es passt. Darum gehören Zugriffsrechte in den Filter und nicht in den
// System-Prompt; ein Chunk, der nie im Prompt steht, kann auch nicht herausgelockt werden. Für
// Zugriffsrechte gilt außerdem:
//   - Wer was lesen darf, bestimmt der Server aus der Anmeldung, nie die Anfrage selbst (siehe
//     `ALLOWED_ACCESS_GROUPS`).
//   - Filtere vor der Suche. Ein Post-Filter liefert weniger als k Treffer (oder gar keinen), und
//     der interne Text war dann schon Teil des Ergebnisses. Selbst Lücken in den Rängen oder die
//     Zahl gestrichener Treffer verraten, dass es zu der Frage interne Dokumente gibt.
//   - Im Zweifel draußen (fail closed): Ein Chunk ohne gültige Zugriffsgruppe wird nie
//     geliefert. Ein Filter ist nur so gut wie die Metadaten.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`). Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l05:3   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die Tabellen für die Einträge in `FILTERS`. Welche Treffer liefert die Suche
//      ohne Filter, die ein Nutzer ohne Zugriff auf interne Dokumente nicht sehen dürfte? Wie
//      viele Treffer bleiben, wenn derselbe Filter erst nach der Suche läuft?
//   2. Ändere `QUESTION` in "Wie begrenze ich Prompt Injection?" und vergleiche die Tabellen der
//      Filter `access groups public` und `mitigation sections`. Welche Abschnitte fallen weg?
//      (Erwartung: Es bleiben nur Abschnitte unter "Präventions- und Mitigationsstrategien";
//      Beschreibungen und Beispiele fallen weg, auch wenn sie der Frage ähnlicher sind.)
//   3. Ergänze in `FILTERS` einen eigenen Filter, der nur lesbare Chunks aus einem Dokument
//      zulässt, z. B. diese Zeile:
//        'only LLM06': (metadata) => mayRead(metadata) && metadata.source === '06-llm06-uebermaessige-handlungsfreiheit.md',
//      Stelle dann eine Frage zu einem anderen Dokument (z. B. die aus Aufgabe 2). Was liefert die
//      Suche, und woran erkennst du, dass die Treffer nicht passen? Lass `mayRead` nie weg: Ohne
//      die Zugriffsprüfung findet dein Filter auch interne Chunks.
//   4. Setze `QUESTION` zurück auf "Welche Unternehmen sind Sponsoren des Projekts?" und
//      `ALLOWED_ACCESS_GROUPS` auf ['public', 'internal'] (eine Mitarbeiterin statt eines Gasts).
//      Welche Treffer kommen beim Zugriffsfilter hinzu?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, isPublicChunk, rankEntries, sectionPath, type ChunkMetadata } from '../shared/index.ts';
import { loadIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Die Frage, zu der passende Chunks gesucht werden. Sie zielt auf den Anhang, der als intern gilt
// (`INTERNAL_DOCUMENTS` in shared/index.ts).
const QUESTION = 'Welche Unternehmen sind Sponsoren des Projekts?';
// Wie viele Chunks am Ende in den Prompt kämen.
const TOP_K = 3;
// NEU: Die Zugriffsgruppen, die der anfragende Nutzer lesen darf. Jeder Chunk trägt genau eine
// Gruppe in seinen Metadaten (`accessGroup`: "public" oder "internal"). Ein Gast darf nur
// ['public'] lesen, eine Mitarbeiterin ['public', 'internal']. Hier steht die Liste als Konstante,
// weil es keine Anmeldung gibt. In einer echten Anwendung leitet der Server sie aus der
// angemeldeten Identität ab. Sie darf nie aus der Anfrage, dem Chat-Text, einem System-Prompt des
// Clients oder einer Modellantwort stammen, sonst wählt sich ein Angreifer seine Rechte selbst.
const ALLOWED_ACCESS_GROUPS: ChunkMetadata['accessGroup'][] = ['public'];
// Die Gruppe, die für einen Chunk gilt. `isPublicChunk` (shared/index.ts, die Regel aus Teil 1, 2
// und 4) nennt einen Chunk nur dann öffentlich, wenn seine Metadaten "public" sagen und sein
// Dokument nicht auf der Liste der internen Dokumente steht. Alles andere zählt als "internal",
// auch ein falsch beschrifteter Chunk: im Zweifel draußen. Einen Chunk ganz ohne oder mit einer
// unbekannten Zugriffsgruppe gibt es hier nicht: `readIndex` lehnt einen solchen Index ab.
const accessGroupOf = (metadata: ChunkMetadata): ChunkMetadata['accessGroup'] =>
  isPublicChunk(metadata) ? 'public' : 'internal';
// NEU: Der Zugriffsfilter. Er sieht wie jeder Filter nur die Metadaten eines Chunks, nie den Text
// oder den Vektor, und antwortet mit ja (bleibt) oder nein (fliegt raus). Jeder weitere Filter
// baut auf ihm auf (`mayRead(metadata) && ...`), nie an ihm vorbei.
const mayRead = (metadata: ChunkMetadata) => ALLOWED_ACCESS_GROUPS.includes(accessGroupOf(metadata));
// Der Name des Zugriffsfilters in der Ausgabe, z. B. "access groups public".
const ACCESS_FILTER = `access groups ${ALLOWED_ACCESS_GROUPS.join('+')}`;
// NEU: Die Filter, die das Programm nacheinander zeigt.
const FILTERS: Record<string, (metadata: ChunkMetadata) => boolean> = {
  // Kein Filter: Jeder Chunk darf gefunden werden, egal aus welcher Zugriffsgruppe. Nur zum
  // Vergleich: Diese Tabelle zeigt absichtlich interne Dateien und Abschnitte. In einer echten
  // Anwendung gibt es keine Suche ohne Zugriffsfilter.
  'no filter': () => true,
  // Zugriffsrecht: nur Chunks, die der Nutzer lesen darf. Mit ['public'] ist das genau der
  // Filter aus Teil 1, 2 und 4 (`isPublicChunk`).
  [ACCESS_FILTER]: mayRead,
  // Zugriffsrecht plus Inhalt: nur lesbare Chunks aus den Abschnitten zu Gegenmaßnahmen.
  // `headingPath[0]` ist der Dokumenttitel, `headingPath[1]` die Überschrift darunter.
  'mitigation sections': (metadata) =>
    mayRead(metadata) && metadata.headingPath?.[1] === 'Präventions- und Mitigationsstrategien',
};
// NEU: Der Filter aus `FILTERS`, für den das Programm zusätzlich die Tabelle des Post-Filters
// zeigt: dieselbe Regel, aber erst nach der Suche angewendet.
const POST_FILTER_EXAMPLE = ACCESS_FILTER;

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfrage zeigt die gesendete Frage und
  // den rohen Vektor der Antwort.
  useBurpIfConfigured();

  // Schritt 1: Index laden, diesmal ohne Filter (`loadIndex` in retrieval.ts). Teil 1 und 2 haben
  // hier schon gefiltert (`loadPublicIndex`).
  const index = loadIndex();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      // Schritt 2: Frage einbetten. Der Fragevektor ist für alle Filter derselbe.
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      // Das Ranking über alle Chunks, als Grundlage für den Post-Filter in Schritt 4.
      const unfilteredHits = withRank(rankEntries(index, queryVector, TOP_K));

      for (const [name, filter] of Object.entries(FILTERS)) {
        // NEU: Schritt 3: Pre-Filter. Erst die Metadaten prüfen, dann nur im Rest suchen.
        const allowed = index.filter(({ metadata }) => filter(metadata));
        const hits = withRank(rankEntries(allowed, queryVector, TOP_K));
        // NEU: Schritt 4: Post-Filter. Erst suchen, dann streichen; es kommt nichts nach.
        const postFilterHits = unfilteredHits.filter(({ metadata }) => filter(metadata));

        // Diese Zeile ist eine Lehrausgabe für dich als Entwickler. Einem Nutzer dürftest du weder
        // zeigen, wie viele Chunks für ihn gesperrt sind, noch wie viele Treffer gestrichen wurden.
        console.log(
          `Filter “${name}” for “${QUESTION}”: ${allowed.length} of ${index.length} chunks searchable,` +
          ` pre-filter returns ${hits.length} hits, post-filter would return ${postFilterHits.length}`,
        );
        printFilterHits(`${name} (pre-filter)`, hits);
        // Die Treffer behalten ihren Rang aus der ungefilterten Suche: Lücken zeigen, was der
        // Filter gestrichen hat. Die Plätze bleiben leer, es rückt kein Chunk nach.
        if (name === POST_FILTER_EXAMPLE) printFilterHits(`${name} (post-filter)`, postFilterHits);
      }
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Nummeriert Treffer in der Reihenfolge des Rankings: Platz 1 ist der ähnlichste Chunk.
function withRank<T>(hits: T[]) {
  return hits.map((hit, position) => ({ ...hit, rank: position + 1 }));
}

// Gibt Treffer als Tabelle aus. `filter` nennt den Filter aus `FILTERS` und ob er vor oder nach
// der Suche lief, damit jede Zeile zeigt, zu welchem Lauf sie gehört.
function printFilterHits(filter: string, hits: { metadata: ChunkMetadata; similarity: number; rank: number }[]) {
  console.table(hits.map(({ metadata, similarity, rank }) => ({
    filter,
    rank,
    similarity: similarity.toFixed(3),
    'access group': metadata.accessGroup,
    file: metadata.source,
    // Der Überschriftenpfad ohne Dokumenttitel; "–" steht für Text direkt unter dem Titel.
    section: sectionPath(metadata.headingPath),
  })));
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
