// Zugriff auf die Dateien des Pakets `ollama-api-facade-js` (die Fassade, siehe Lektion 01, Teil 2).
// `facadeRequire` lädt Module so, wie die Fassade selbst sie findet. Damit bekommen wir deren eigene
// Kopie von Express (Version 4) und nicht die Express-Version aus unserer `package.json`.
// `facadeVersion` ist die installierte Version der Fassade. `server.ts` und `stream.ts` prüfen sie,
// damit eine Neuinstallation mit einer anderen Version nicht stillschweigend das Verhalten ändert,
// sondern sofort einen klaren Fehler auslöst.
import { createRequire } from 'node:module';

export const EXPECTED_FACADE_VERSION = '1.0.7';
export const facadeRequire = createRequire(createRequire(import.meta.url).resolve('ollama-api-facade-js'));
export const facadeVersion: unknown = facadeRequire('../package.json').version;
