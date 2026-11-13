// Lektion 03 – Embeddings, Teil 1: Dein erstes Embedding
//
// Lernziel: Du machst aus zwei Sätzen Vektoren und misst ihre Ähnlichkeit mit der Kosinus-Ähnlichkeit.
// Braucht:  LM Studio mit geladenem E5-Modell (`REMOTE_EMBEDDING_MODEL_NAME`); Burp optional.
// Start:    npm run l03:1   (oder F5)
// Erklärt:  lessons/03-embeddings/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. Ersetze `textB` durch einen Satz zu einem ganz anderen Thema (z. B. Fahrplan der Bahn).
//      Wie stark sinkt der Wert, und liegt er trotzdem noch über 0,5?
//      ↺ Danach den ursprünglichen Satz zurück.
//   2. Setze `textB` gleich `textA`. Welchen Wert erwartest du, bevor du startest?
//      ↺ Danach zurücksetzen: `git checkout -- lessons/03-embeddings/01-hello-embeddings.ts`.
//   3. Mit Burp: Öffne die Antwort und suche die Zahlenliste eines Vektors.
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest ist Handwerk.
import { OpenAIEmbeddings } from '@langchain/openai';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logInvocation } from '../shared/logging.ts';
import { assertVectorCount, cosineSimilarity, e5Model } from '../shared/embeddings.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Mit Burp zeigt die Anfrage die gesendeten Texte und die Antwort die rohen Vektoren.
  useBurpIfConfigured();

  const embeddings = new OpenAIEmbeddings({
    model: remoteEmbeddingModel.name,
    apiKey: remoteEmbeddingModel.apiKey,
    // Der OpenAI-Client verlangt sonst base64-kodierte Vektoren. Fließkommazahlen lassen sich in Burp lesen
    // und funktionieren mit jedem OpenAI-kompatiblen Server.
    encodingFormat: 'float',
    // Wiederholungen würden in Burp als verwirrende doppelte Anfragen auftauchen; lieber sofort scheitern.
    maxRetries: 0,
    configuration: { baseURL: remoteEmbeddingModel.baseURL },
  });

  // Ähnliche Bedeutung, fast keine gemeinsamen Wörter: Eine Stichwortsuche würde sie nicht verbinden.
  const textA = 'Nach einem langen Arbeitstag freute sich Lisa auf eine Tasse heißen Kamillentee.';
  const textB = 'Entspannung nach einem anstrengenden Tag mit einem warmen Getränk.';

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name }, async () => {
      // KERN 1: Eine Anfrage, zwei Texte, zwei Vektoren. Beide bekommen "query: ": E5 ist mit Rollen-Präfixen
      // trainiert (Teil 3), und hier werden zwei gleichberechtigte Sätze verglichen, keine Frage mit einem Dokument.
      const vectors = await embeddings.embedDocuments([
        `${e5Model.queryPrefix}${textA}`,
        `${e5Model.queryPrefix}${textB}`,
      ]);
      assertVectorCount(vectors, 2);
      const [vectorA, vectorB] = vectors;
      // KERN 2: Kosinus-Ähnlichkeit der beiden Vektoren: 1 = gleiche Richtung. Bei E5 liegen auch unverwandte
      // Texte hoch; erst der Vergleich in Teil 2 zeigt, was die Zahl bedeutet.
      const similarity = cosineSimilarity(vectorA, vectorB);
      console.log(`Cosine similarity: ${similarity.toFixed(3)}`);
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

await runMain(main);
