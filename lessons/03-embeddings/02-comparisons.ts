// Lektion 03 – Embeddings, Teil 2: Passagen nach Bedeutung sortieren
//
// Lernziel: Du sortierst Texte nach ihrer Bedeutung für eine Frage: das Prinzip der semantischen Suche.
// Braucht:  LM Studio mit E5 und EmbeddingGemma (`REMOTE_EMBEDDING_GEMMA_MODEL_NAME`); Burp optional.
// Start:    npm run l03:2   (oder F5)
// Erklärt:  lessons/03-embeddings/GUIDE.de.md → „Teil 2“
//
// Aufgabe:
//   1. Füge `passages` eine eigene Passage hinzu und sage vorher voraus, auf welchem Platz sie landet. Stimmt es?
//      ↺ Danach die Passage wieder entfernen.
//   2. Ändere `query` in eine Frage zum Bahnfahrplan. Welche Passage steht jetzt oben?
//      ↺ Danach `query` zurück.
//   3. Vergleiche den Abstand zwischen Platz 3 (letzte passende Passage) und Platz 4 (erster Ablenker)
//      bei E5 und bei Gemma. Welches Modell trennt Passendes und Unpassendes deutlicher?
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logError, logInvocation } from '../shared/logging.ts';
import { models } from './embeddings.ts';
import { assertVectorCount, cosineSimilarity, createEmbeddings } from '../shared/embeddings.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Mit Burp zeigt die Anfrage die gesendeten Texte und die Antwort die rohen Vektoren.
  useBurpIfConfigured();

  const query = 'Wie kann ich mich nach Feierabend bei einem heißen Getränk entspannen?';
  // Die Passagen 1, 2 und 5 passen inhaltlich zur Anfrage, teilen aber kaum Wörter mit ihr.
  // Die Passagen 3 und 4 (Fahrplan, Tomaten) sind unverwandte Ablenker und sollten hinten landen.
  const passages = [
    'Lisa genießt Kamillentee und lässt den stressigen Bürotag ruhig ausklingen.',
    'Eine Tasse warmer Kakao auf dem Sofa hilft Paul, die Anstrengungen des Tages zu vergessen.',
    'Der neue Fahrplan bietet zusätzliche Zugverbindungen zwischen Berlin und Hamburg.',
    'Im Garten wachsen Tomaten besonders gut an sonnigen Standorten.',
    'Ein gemütlicher Abend mit Kräutertee und einem guten Buch sorgt für Erholung.',
  ];

  await checkModelServer({ viaBurp: true });

  for (const model of models) {
    try {
      await logInvocation('Embedding', { model: model.name, passageCount: passages.length }, async () => {
        const embeddings = createEmbeddings(model.name);
        // KERN 1: Anfrage und Passagen bekommen verschiedene Rollen-Präfixe; jedes Modell hat eigene (embeddings.ts).
        const queryVector = await embeddings.embedQuery(`${model.queryPrefix}${query}`);
        const passageVectors = await embeddings.embedDocuments(
          passages.map((passage) => `${model.passagePrefix}${passage}`),
        );
        assertVectorCount(passageVectors, passages.length);
        // KERN 2: Ähnlichkeit jeder Passage zur Anfrage berechnen und absteigend sortieren.
        const rankedPassages = passages
          .map((text, index) => ({
            text,
            similarity: cosineSimilarity(queryVector, passageVectors[index]),
          }))
          .sort((a, b) => b.similarity - a.similarity);

        console.log(`Model: ${model.name}`);
        console.log(`Query: ${query}`);
        console.log('Passages ranked by cosine similarity:');
        rankedPassages.forEach(({ text, similarity }, index) => {
          console.log(`${index + 1}. ${similarity.toFixed(3)} – ${text}`);
        });
      });
    } catch (error) {
      logError(error);
      // Weitermachen: Ein fehlgeschlagenes Modell soll den Vergleich mit dem anderen nicht stoppen.
      process.exitCode = 1;
    }
  }
}

await runMain(main);
