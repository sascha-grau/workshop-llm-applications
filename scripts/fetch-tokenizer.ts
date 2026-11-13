// Lädt den E5-Tokenizer vorab in `.cache/tokenizers/` (einmal, braucht Internet), damit `npm run l04:0`
// danach offline exakt zählt. Der Selbsttest unten prüft, dass das Präfix "passage: " vier Tokens ergibt.
// Start: npm run tokenizer:fetch
import { loadE5TokenCounter, tokenizerCacheDirectory } from '../lessons/04-chunking/tokenizer.ts';
import { runMain } from '../lessons/shared/startup.ts';

await runMain(async () => {
  const count = await loadE5TokenCounter();
  if (count('passage: ') !== 4) throw new Error('E5 tokenizer self-check failed.');
  console.log(`E5 tokenizer ready for offline use: ${tokenizerCacheDirectory}`);
});
