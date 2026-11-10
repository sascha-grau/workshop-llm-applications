// Lektion 03 – Embeddings, Teil 1: Dein erstes Embedding
//
// Lernziel: Du verstehst, was ein Embedding ist, und misst die Ähnlichkeit zweier Sätze mit der
// Kosinus-Ähnlichkeit.
//
// Ein Embedding-Modell macht aus einem Text einen Vektor, also eine lange Liste von Zahlen, die
// seine Bedeutung beschreibt. Zwei Sätze mit ähnlicher Bedeutung, aber fast ohne gemeinsame Wörter,
// bekommen Vektoren, die in eine ähnliche Richtung zeigen. Die Kosinus-Ähnlichkeit misst diese
// Richtung als Zahl zwischen -1 und 1. Das Programm schickt zwei Sätze an den Server und gibt die
// Ähnlichkeit aus: ein Aufruf, eine Zahl, kein eigener Server.
//
// Achtung: Das E5-Modell liefert auch für Texte ohne Zusammenhang oft hohe Werte (etwa 0,7 bis 0,8).
// Der absolute Wert sagt wenig; entscheidend ist die Reihenfolge beim Vergleichen (siehe Teil 2).
//
// Modell: multilingual-e5-base (E5), Modellbeschreibung: https://huggingface.co/intfloat/multilingual-e5-base
// Trage in .env bei REMOTE_EMBEDDING_MODEL_NAME den Namen ein, den LM Studio für das geladene Modell
// anzeigt.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell (REMOTE_MODEL_BASE_URL
// und REMOTE_EMBEDDING_MODEL_NAME in .env). Burp ist
// optional: Ist BURP_PROXY_URL gesetzt, siehst du die Texte und die rohen Vektoren in der HTTP-History.
// Start: npm run l03:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Ersetze textB durch einen Satz zu einem ganz anderen Thema (z. B. Fahrplan der Bahn).
//      Wie stark sinkt der Wert, und liegt er trotzdem noch über 0,5?
//   2. Setze textB gleich textA. Welchen Wert erwartest du, bevor du startest?
//   3. Öffne in Burp die Antwort und suche die Zahlenliste eines Vektors (nur mit Burp).
import { OpenAIEmbeddings } from '@langchain/openai';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logInvocation } from '../shared/logging.ts';
import { assertVectorCount, cosineSimilarity, e5Model } from '../shared/embeddings.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfrage zeigt die gesendeten Texte und die
  // rohen Vektoren der Antwort.
  useBurpIfConfigured();

  const embeddings = new OpenAIEmbeddings({
    model: remoteEmbeddingModel.name,
    apiKey: remoteEmbeddingModel.apiKey,
    // Der OpenAI-Client verlangt standardmäßig base64-kodierte Vektoren. Gewöhnliche Fließkommazahlen
    // lassen sich in Burp lesen und funktionieren mit jedem OpenAI-kompatiblen Server.
    encodingFormat: 'float',
    // Wiederholungen würden in Burp als verwirrende doppelte Anfragen auftauchen; lieber sofort scheitern.
    maxRetries: 0,
    configuration: { baseURL: remoteEmbeddingModel.baseURL },
  });

  // Ähnliche Bedeutung, fast keine gemeinsamen Wörter: Eine Stichwortsuche würde diese beiden Sätze
  // nicht verbinden.
  const textA = 'Nach einem langen Arbeitstag freute sich Lisa auf eine Tasse heißen Kamillentee.';
  const textB = 'Entspannung nach einem anstrengenden Tag mit einem warmen Getränk.';

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name }, async () => {
      // E5-Modelle sind mit einem Präfix trainiert, das die Rolle eines Texts markiert: "passage: "
      // für gespeicherte Dokumente, "query: " für Suchanfragen (mehr dazu in Teil 3). Hier werden zwei
      // gleichberechtigte Sätze verglichen, deshalb bekommen beide "query: ". Ohne Präfix werden die
      // Ähnlichkeiten schlechter.
      // NEU: embedDocuments schickt mehrere Texte in einer Anfrage und liefert je Text einen Vektor.
      const vectors = await embeddings.embedDocuments([
        `${e5Model.queryPrefix}${textA}`,
        `${e5Model.queryPrefix}${textB}`,
      ]);
      assertVectorCount(vectors, 2);
      const [vectorA, vectorB] = vectors;
      // NEU: Kosinus-Ähnlichkeit der beiden Vektoren (1 = gleiche Richtung; bei E5 liegen auch
      // unverwandte Texte oft bei 0,7–0,8).
      const similarity = cosineSimilarity(vectorA, vectorB);
      console.log(`Cosine similarity: ${similarity.toFixed(3)}`);
    });
  } catch {
    process.exitCode = 1;
  }
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
