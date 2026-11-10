// Alle Pfade im Projekt werden vom Repo-Root aus aufgelöst, nicht vom aktuellen Arbeitsverzeichnis.
// Deshalb funktionieren die Programme egal, aus welchem Ordner du sie startest.
import { resolve } from 'node:path';

// Repo-Root: zwei Ordner über dieser Datei (lessons/shared/ -> Root).
export const repoRoot = resolve(import.meta.dirname, '../..');
export const rootPath = (...segments: string[]): string => resolve(repoRoot, ...segments);
export const contentDirectory = rootPath('content');
// Hier schreibt Lektion 04 ihre Indizes hin (steht in .gitignore).
export const indexesDirectory = rootPath('indexes');
