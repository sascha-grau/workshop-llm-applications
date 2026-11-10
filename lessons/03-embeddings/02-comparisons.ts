// Lektion 03 – Embeddings, Teil 2: Passagen nach Bedeutung sortieren
//
// Lernziel: Du verstehst, wie semantische Suche funktioniert, die Grundlage von RAG: Texte finden,
// die zur Bedeutung einer Frage passen, nicht zu ihren Stichwörtern.
//
// Eine Suchanfrage wird mit mehreren gespeicherten Passagen verglichen: Jeder Text wird einmal
// eingebettet, dann werden die Passagen nach Kosinus-Ähnlichkeit zur Anfrage sortiert. Dasselbe
// Muster nutzt RAG (Retrieval-Augmented Generation): Passende Textstücke suchen und sie dem
// Sprachmodell als Kontext mitgeben (Lektion 05).
//
// Anfrage und Passagen laufen durch zwei Embedding-Modelle auf demselben Server: E5 und
// EmbeddingGemma. Jedes Modell gibt sein eigenes Ranking aus.
//
// Merke: Bei E5 liegen auch unverwandte Passagen oft bei 0,7 bis 0,8. Vergleiche die Reihenfolge,
// nicht die absoluten Werte, und vergleiche Werte nicht zwischen den Modellen.
//
// Modelle und ihre Beschreibungen:
//   - E5 (multilingual-e5-base): https://huggingface.co/intfloat/multilingual-e5-base
//   - EmbeddingGemma 300m: https://huggingface.co/google/embeddinggemma-300m
//     (Name in .env: REMOTE_EMBEDDING_GEMMA_MODEL_NAME; siehe embeddings.ts)
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und beiden geladenen Modellen (E5 aus
// REMOTE_EMBEDDING_MODEL_NAME, EmbeddingGemma aus REMOTE_EMBEDDING_GEMMA_MODEL_NAME). Burp ist optional.
// Start: npm run l03:2   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Füge der Liste passages eine eigene Passage hinzu und sage vorher voraus, auf welchem Platz
//      sie landet. Stimmt es?
//   2. Ändere die Suchanfrage in eine Frage zum Bahnfahrplan. Welche Passage steht jetzt oben?
//   3. Vergleiche den Abstand zwischen Platz 3 (letzte passende Passage) und Platz 4 (erster
//      Ablenker) bei E5 und bei Gemma. Welches Modell trennt Passendes und Unpassendes deutlicher?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logError, logInvocation } from '../shared/logging.ts';
import { models } from './embeddings.ts';
import { assertVectorCount, cosineSimilarity, createEmbeddings } from '../shared/embeddings.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfrage zeigt die gesendeten Texte und die
  // rohen Vektoren der Antwort.
  useBurpIfConfigured();

  // Jedes Modell wurde mit eigenen Rollen-Präfixen trainiert: eines für die Suchanfrage
  // (embedQuery), ein anderes für die gespeicherten Texte (embedDocuments). E5 nutzt "query: " und
  // "passage: ", EmbeddingGemma eigene Aufgaben-Präfixe. Ein falsches Präfix verschlechtert das
  // Ranking (Details in Teil 3). Beide Modelle und ihre Präfixe stehen in embeddings.ts: E5 ist das
  // Modell aus REMOTE_EMBEDDING_MODEL_NAME, EmbeddingGemma aus REMOTE_EMBEDDING_GEMMA_MODEL_NAME auf
  // demselben Server (gleiche Basis-URL und gleicher API-Key), nur unter anderem Namen.

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
        // NEU: Anfrage und Passagen bekommen unterschiedliche Präfixe (embedQuery / embedDocuments).
        const queryVector = await embeddings.embedQuery(`${model.queryPrefix}${query}`);
        const passageVectors = await embeddings.embedDocuments(
          passages.map((passage) => `${model.passagePrefix}${passage}`),
        );
        assertVectorCount(passageVectors, passages.length);
        // NEU: Ranking: Ähnlichkeit jeder Passage zur Anfrage berechnen, absteigend sortieren.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
