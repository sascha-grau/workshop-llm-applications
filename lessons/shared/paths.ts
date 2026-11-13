// Pfade vom Repo-Root aus statt vom Arbeitsverzeichnis, damit Programme aus jedem Ordner laufen.
// Nur `.env` lädt Node relativ zum Arbeitsverzeichnis. Übersicht: lessons/shared/README.de.md
import { resolve } from 'node:path';

// Invariante: Diese Datei liegt zwei Ordner unter dem Repo-Root.
export const repoRoot = resolve(import.meta.dirname, '../..');
export const rootPath = (...segments: string[]): string => resolve(repoRoot, ...segments);
export const contentDirectory = rootPath('content');
// Erzeugte Indizes; nicht im Repo (.gitignore).
export const indexesDirectory = rootPath('indexes');
