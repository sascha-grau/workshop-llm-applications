// Version und Module des Pakets `ollama-api-facade-js`. Übersicht: lessons/shared/README.de.md
// `facadeRequire` löst Module auf wie die Fassade selbst, liefert also ihr eigenes Express 4, nicht unseres.
// Fest auf `EXPECTED_FACADE_VERSION`, weil stream.ts ein privates Feld liest: docs/decisions.de.md#fassade-gepinnt
import { createRequire } from 'node:module';

export const EXPECTED_FACADE_VERSION = '1.0.7';
export const facadeRequire = createRequire(createRequire(import.meta.url).resolve('ollama-api-facade-js'));
export const facadeVersion: unknown = facadeRequire('../package.json').version;
