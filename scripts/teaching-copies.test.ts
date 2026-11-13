// Tests für die Lehrkopien (LEHRKOPIE im Dateikopf): Die ausgeschriebene Kopie in einer Lektion muss sich
// wie das Original verhalten (MMR in Lektion 05, Trefferquote und MRR in Lektion 08). Die Funktionen
// werden per TypeScript-Syntaxbaum herausgelöst und in einem leeren Kontext ausgeführt, ohne Modell-Server.
// Start: `npm run check` (oder `node --test scripts/teaching-copies.test.ts`).
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';
import { API } from 'typescript/unstable/async';
import {
  isArrowFunction, isBlock, isCallExpression, isFunctionDeclaration, isIdentifier,
  isVariableStatement, SyntaxKind,
  type FunctionDeclaration, type Node, type SourceFile, type Statement,
} from 'typescript/unstable/ast';

type Candidate = { id: string; vector: number[]; similarity: number };
type Selection = (Candidate & { redundancy: number })[];
type SelectByMmr = (candidates: Candidate[], topK: number, lambda: number) => Selection;
type Question = { id: string; question: string; expectedSources: string[] };
type Hit = { metadata: { source: string }; similarity: number };
type Scores = { questionCount: number; hitRatio: number; mrr: number };
type MeasureRetrieval = (index: Hit[], questions: Question[], topK: number) => Promise<Scores>;

const root = fileURLToPath(new URL('..', import.meta.url));
const filenames = {
  mmrOriginal: 'lessons/05-retrieval-strategies/retrieval.ts',
  mmrCopy: 'lessons/05-retrieval-strategies/02-mmr.ts',
  scoresOriginal: 'lessons/08-evaluations/evaluation.ts',
  scoresCopy: 'lessons/08-evaluations/01-hitratio-mrr.ts',
  embeddings: 'lessons/shared/embeddings.ts',
};

async function readSyntaxTrees(): Promise<Record<keyof typeof filenames, SourceFile>> {
  const api = new API({ cwd: root });
  try {
    const snapshot = await api.updateSnapshot({ openFiles: Object.values(filenames).map(file => path.join(root, file)) });
    try {
      return Object.fromEntries(await Promise.all(Object.entries(filenames).map(async ([key, file]) => {
        const filename = path.join(root, file);
        const project = await snapshot.getDefaultProjectForFile(filename);
        assert.ok(project, `No TypeScript project for ${file}`);
        assert.deepEqual(await project.program.getSyntacticDiagnostics(filename), [], `Invalid TypeScript in ${file}`);
        const source = await project.program.getSourceFile(filename);
        assert.ok(source, `Cannot parse ${file}`);
        return [key, source];
      }))) as Record<keyof typeof filenames, SourceFile>;
    } finally {
      await snapshot.dispose();
    }
  } finally {
    await api.close();
  }
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  node.forEachChild(child => { walk(child, visit); });
}

function assertIsolated(node: Node): void {
  const forbiddenNames = new Set([
    'process', 'require', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'eval', 'Function',
    'runMain', 'checkModelServer', 'useBurpIfConfigured',
  ]);
  walk(node, child => {
    assert.ok(![
      SyntaxKind.ImportDeclaration, SyntaxKind.ImportEqualsDeclaration, SyntaxKind.ImportKeyword,
      SyntaxKind.ExportDeclaration, SyntaxKind.ExportAssignment,
    ].includes(child.kind), 'Extracted code must not import or re-export modules');
    if (isIdentifier(child)) assert.ok(!forbiddenNames.has(child.text), `Forbidden dependency: ${child.text}`);
  });
}

function functionSource(source: SourceFile, name: string): string {
  const declarations = source.statements.filter((statement): statement is FunctionDeclaration =>
    isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.equal(declarations.length, 1, `Expected exactly one ${name} function in ${source.fileName}`);
  assert.ok(declarations[0].body, `Missing ${name} implementation in ${source.fileName}`);
  assertIsolated(declarations[0]);
  return declarations[0].getText(source).replace(/^export\s+/, '');
}

function declares(statement: Statement, name: string): boolean {
  return isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
    isIdentifier(declaration.name) && declaration.name.text === name);
}

function scoringCopySource(source: SourceFile): string {
  const blocks: Statement[][] = [];
  walk(source, node => {
    if (!isCallExpression(node) || !isIdentifier(node.expression) || node.expression.text !== 'logInvocation') return;
    for (const argument of node.arguments) {
      if (!isArrowFunction(argument) || !isBlock(argument.body)) continue;
      const statements = [...argument.body.statements];
      if (statements.length && declares(statements[0], 'results')) blocks.push(statements);
    }
  });
  assert.equal(blocks.length, 1, `Expected one inline retrieval scoring block in ${source.fileName}`);
  const statements = blocks[0];
  assert.ok(declares(statements[1], 'hitCount') && declares(statements[2], 'reciprocalRankSum'),
    'The scoring copy must begin with results and both score accumulators');
  assert.match(statements[0].getFullText(source), /LEHRKOPIE[^\n]*measureRetrieval/);
  const end = statements.findIndex(statement => declares(statement, 'mrr'));
  assert.ok(end > 2 && declares(statements[end - 1], 'hitRatio'), 'Cannot locate both final retrieval metrics');
  const selected = statements.slice(0, end + 1);
  selected.forEach(assertIsolated);
  return `async function measureRetrievalCopy(index, questions, topK) {
    const questionSet = { questions };
    const TOP_K = topK;
    ${selected.map(statement => statement.getText(source)).join('\n')}
    return { questionCount: results.length, hitRatio, mrr };
  }`;
}

function isolatedFunction<T>(source: string, dependencies: Record<string, unknown> = {}): T {
  const context = createContext(Object.assign(Object.create(null), dependencies), {
    codeGeneration: { strings: false, wasm: false },
  });
  const unavailable = new Script('[typeof process, typeof require, typeof fetch, typeof WebSocket, typeof XMLHttpRequest]')
    .runInContext(context, { timeout: 1_000 }) as string[];
  assert.deepEqual(Array.from(unavailable), Array(5).fill('undefined'));
  const javascript = stripTypeScriptTypes(`(${source})`, { mode: 'strip' });
  return new Script(javascript).runInContext(context, { timeout: 1_000 }) as T;
}

const sources = await readSyntaxTrees();
const cosineSource = functionSource(sources.embeddings, 'cosineSimilarity');
const mmrSources = [sources.mmrOriginal, sources.mmrCopy].map(source => functionSource(source, 'selectByMmr'));
const scoreSources = [functionSource(sources.scoresOriginal, 'measureRetrieval'), scoringCopySource(sources.scoresCopy)];
const selectFunctions = mmrSources.map(source => isolatedFunction<SelectByMmr>(source, {
  cosineSimilarity: isolatedFunction<(a: number[], b: number[]) => number>(cosineSource),
}));

const candidates: Candidate[] = [
  { id: 'a', vector: [1, 0, 0], similarity: 0.95 },
  { id: 'b', vector: [1, 0, 0], similarity: 0.9 },
  { id: 'c', vector: [0, 1, 0], similarity: 0.85 },
  { id: 'd', vector: [0, 0, 1], similarity: 0.7 },
  { id: 'e', vector: [-1, 0, 0], similarity: 0.65 },
];

for (const lambda of [1, 0.6, 0]) {
  for (const topK of [0, 1, 3, 10]) {
    test(`MMR copy matches full original output for lambda=${lambda}, topK=${topK}`, () => {
      const input = structuredClone(candidates);
      const before = structuredClone(input);
      input.forEach(candidate => { Object.freeze(candidate.vector); Object.freeze(candidate); });
      Object.freeze(input);
      const [original, copy] = selectFunctions.map(select => structuredClone(select(input, topK, lambda)));
      assert.deepEqual(copy, original);
      const expectedIds = lambda === 1 ? ['a', 'b', 'c', 'd', 'e'] : ['a', 'c', 'd', 'e', 'b'];
      assert.deepEqual(original.map(({ id }) => id), expectedIds.slice(0, topK));
      assert.deepEqual(original.map(({ id, redundancy }) => [id, redundancy]),
        expectedIds.slice(0, topK).map(id => [id, id === 'b' ? 1 : 0]));
      assert.deepEqual(input, before);
    });
  }
}

test('MMR copies preserve stable ties and handle an empty candidate list', () => {
  const tied = candidates.map(candidate => ({ ...candidate, similarity: 0.5 }));
  for (const select of selectFunctions) {
    assert.deepEqual(structuredClone(select([], 5, 0.6)), []);
    assert.deepEqual(Array.from(select(tied, 10, 1), ({ id }) => id), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(Array.from(select(tied, 10, 0.6), ({ id }) => id), ['a', 'c', 'd', 'e', 'b']);
  }
});

test('MMR copies balance partial cosine redundancy against relevance', () => {
  const input: Candidate[] = [
    { id: 'a', vector: [1, 0], similarity: 0.95 },
    { id: 'b', vector: [0.8, 0.6], similarity: 0.9 },
    { id: 'c', vector: [0, 1], similarity: 0.3 },
    { id: 'd', vector: [-1, 0], similarity: 0.1 },
  ];
  for (const [lambda, ids] of [
    [1, ['a', 'b', 'c', 'd']],
    [0.6, ['a', 'b', 'd', 'c']],
    [0, ['a', 'c', 'd', 'b']],
  ] as const) {
    const [original, copy] = selectFunctions.map(select => structuredClone(select(input, 4, lambda)));
    assert.deepEqual(copy, original);
    assert.deepEqual(original.map(({ id }) => id), [...ids]);
    assert.equal(original.find(({ id }) => id === 'b')!.redundancy, 0.8);
  }
});

const questions: Question[] = [
  { id: 'first', question: 'first hit', expectedSources: ['first.md'] },
  { id: 'second', question: 'second hit', expectedSources: ['alternative.md', 'second.md'] },
  { id: 'missing', question: 'missing hit', expectedSources: ['absent.md'] },
  { id: 'excluded', question: 'without source', expectedSources: [] },
];
const hitFixtures = new Map<string, string[]>([
  ['first hit', ['first.md', 'first.md', 'other.md']],
  ['second hit', ['other.md', 'second.md', 'alternative.md']],
  ['missing hit', ['other.md', 'unrelated.md']],
]);

async function measureFixture(source: string, input: Question[], topK: number): Promise<Scores> {
  const index: Hit[] = [];
  const embeddingCalls: string[] = [];
  const rankingCalls: string[] = [];
  const fixtureNames = [...hitFixtures.keys()];
  const measure = isolatedFunction<MeasureRetrieval>(source, {
    remoteEmbeddingModel: { name: 'deterministic-fixture' },
    embeddingQuery: (question: string) => `fixture: ${question}`,
    embeddings: {
      embedQuery: async (query: string) => {
        const position = fixtureNames.findIndex(question => query === `fixture: ${question}`);
        assert.ok(position >= 0, `Unexpected embedding request: ${query}`);
        embeddingCalls.push(query);
        return [position];
      },
    },
    rankEntries: (actualIndex: Hit[], vector: number[], actualTopK: number) => {
      assert.equal(actualIndex, index);
      assert.equal(actualTopK, topK);
      const question = fixtureNames[vector[0]];
      assert.ok(question && hitFixtures.has(question), 'Unexpected fixture vector');
      rankingCalls.push(question);
      return hitFixtures.get(question)!.slice(0, actualTopK).map(source => ({ metadata: { source }, similarity: 0.8 }));
    },
    logInvocation: async (_label: string, _metadata: unknown, callback: () => Promise<Scores>) => callback(),
    basename: path.basename,
    console: { log: () => {}, table: () => {} },
  });
  const before = structuredClone(input);
  const result = structuredClone(await measure(index, input, topK));
  const scored = input.filter(({ expectedSources }) => expectedSources.length > 0).map(({ question }) => question);
  assert.deepEqual(embeddingCalls, scored.map(question => `fixture: ${question}`));
  assert.deepEqual(rankingCalls, scored);
  assert.deepEqual(input, before);
  return result;
}

for (const [topK, hitRatio, mrr] of [[0, 0, 0], [1, 1 / 3, 1 / 3], [2, 2 / 3, 0.5], [10, 2 / 3, 0.5]]) {
  test(`Retrieval scoring copy matches expected hit ratio and MRR for topK=${topK}`, async () => {
    const [original, copy] = await Promise.all(scoreSources.map(source => measureFixture(source, questions, topK)));
    assert.deepEqual(copy, original);
    assert.deepEqual(original, { questionCount: 3, hitRatio, mrr });
  });
}

test('Retrieval scoring copies return zero without embedding unscored or absent questions', async () => {
  for (const input of [[], [questions[3]]]) {
    for (const source of scoreSources) {
      assert.deepEqual(await measureFixture(source, input, 5), { questionCount: 0, hitRatio: 0, mrr: 0 });
    }
  }
});
