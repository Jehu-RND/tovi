/**
 * Layer discovery — flattening and rendering a Figma file tree.
 *
 * Pure tree work: no network, no browser. The fixture mirrors the shape a real
 * file has — a document whose children are pages, each holding frames.
 */

import { describe, expect, it } from 'vitest';
import { flattenLayers, pageNames, renderLayers } from '../src/figma/layers.js';
import type { FigmaFile, RawFigmaNode } from '../src/figma/client.js';

function node(
  id: string,
  name: string,
  type: string,
  children: RawFigmaNode[] = [],
): RawFigmaNode {
  return {
    id,
    name,
    type,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Two pages, so page filtering has something to exclude. */
const file: FigmaFile = {
  name: 'Sport-Specific Landing Page',
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      node('1:1', "Men's Basketball", 'CANVAS', [
        node('1:20', 'hero', 'FRAME', [
          node('1:23', 'heading', 'TEXT'),
          node('1:45', 'Button', 'INSTANCE'),
        ]),
        node('1:99', 'Frame 31306', 'FRAME'),
      ]),
      node('2:1', "Women's Soccer", 'CANVAS', [node('2:20', 'hero', 'FRAME')]),
    ],
  },
};

describe('flattenLayers', () => {
  it('flattens the whole file in document order', () => {
    const rows = flattenLayers(file);
    expect(rows.map((row) => row.nodeId)).toEqual([
      '1:1', '1:20', '1:23', '1:45', '1:99', '2:1', '2:20',
    ]);
  });

  it('reports a page at depth 0 and its frames one level in', () => {
    const rows = flattenLayers(file);
    expect(rows.find((row) => row.nodeId === '1:1')?.depth).toBe(0);
    expect(rows.find((row) => row.nodeId === '1:20')?.depth).toBe(1);
    expect(rows.find((row) => row.nodeId === '1:23')?.depth).toBe(2);
  });

  it('restricts to one page, matched case-insensitively', () => {
    const rows = flattenLayers(file, { page: "men's basketball" });
    expect(rows.every((row) => row.nodeId.startsWith('1:'))).toBe(true);
    expect(rows).toHaveLength(5);
  });

  it('carries an ancestor path so identical names can be told apart', () => {
    const rows = flattenLayers(file, { search: 'hero' });
    expect(rows.map((row) => row.path)).toEqual(["Men's Basketball", "Women's Soccer"]);
  });

  it('filters by name without hiding matches nested in non-matching parents', () => {
    // "heading" sits inside "hero", which does not match the search.
    const rows = flattenLayers(file, { search: 'heading' });
    expect(rows.map((row) => row.nodeId)).toEqual(['1:23']);
  });

  it('filters by node type', () => {
    const rows = flattenLayers(file, { types: ['text', 'instance'] });
    expect(rows.map((row) => row.nodeId)).toEqual(['1:23', '1:45']);
  });

  it('stops descending past maxDepth', () => {
    const rows = flattenLayers(file, { maxDepth: 1 });
    expect(rows.map((row) => row.nodeId)).toEqual(['1:1', '1:20', '1:99', '2:1', '2:20']);
  });

  it('matches a page on whole words, not raw substrings', () => {
    // "Women's Soccer" contains the characters of "Men's" — wo|men's — so a
    // raw substring match would pull in the wrong page.
    const rows = flattenLayers(file, { page: "Men's Basketball" });
    expect(rows.every((row) => row.nodeId.startsWith('1:'))).toBe(true);
    expect(rows).toHaveLength(5);
  });

  it('matches a page name carrying decoration the caller would not type', () => {
    // The real file names its pages "Men's Basketball 🏀". An exact string
    // comparison never fires, and substring matching then selects both pages.
    const decorated: FigmaFile = {
      name: 'Sport-Specific Landing Page',
      document: {
        id: '0:0', name: 'Document', type: 'DOCUMENT',
        children: [
          node('1:1', "Men's Basketball 🏀", 'CANVAS', [node('1:20', 'hero', 'FRAME')]),
          node('2:1', "Women's Basketball 🏀", 'CANVAS', [node('2:20', 'hero', 'FRAME')]),
        ],
      },
    };
    const rows = flattenLayers(decorated, { page: "Men's Basketball" });
    expect(rows.map((row) => row.nodeId)).toEqual(['1:1', '1:20']);
  });

  it('still matches loosely when no page name matches in full', () => {
    const rows = flattenLayers(file, { page: 'soccer' });
    expect(rows.map((row) => row.nodeId)).toEqual(['2:1', '2:20']);
  });

  it('matches every page sharing a loose term', () => {
    const rows = flattenLayers(file, { page: 'hero' });
    // No page is called "hero", so nothing matches — pages, not their contents.
    expect(rows).toEqual([]);
  });

  it('returns no rows for a page name that does not exist', () => {
    expect(flattenLayers(file, { page: 'Lacrosse' })).toEqual([]);
  });

  it('omits size for a node Figma cannot measure', () => {
    const bare: FigmaFile = {
      name: 'f',
      document: {
        id: '0:0', name: 'Document', type: 'DOCUMENT',
        children: [{ id: '1:1', name: 'Page', type: 'CANVAS' }],
      },
    };
    expect(flattenLayers(bare)[0]?.width).toBeUndefined();
  });
});

describe('pageNames', () => {
  it('lists the file\'s pages, for the no-match message', () => {
    expect(pageNames(file)).toEqual(["Men's Basketball", "Women's Soccer"]);
  });
});

describe('renderLayers', () => {
  it('leads with the file name and a layer count', () => {
    const output = renderLayers(file, flattenLayers(file, { page: "Men's Basketball" }));
    expect(output.split('\n')[0]).toContain('Sport-Specific Landing Page');
    expect(output.split('\n')[0]).toContain('5 layers');
  });

  it('puts the node id first, since that is what gets copied out', () => {
    const output = renderLayers(file, flattenLayers(file, { search: 'heading' }));
    expect(output).toMatch(/^ {2}1:23\s+TEXT/m);
  });

  it('indents by depth so the listing reads like the layers panel', () => {
    const output = renderLayers(file, flattenLayers(file, { page: "Men's Basketball" }));
    const heading = output.split('\n').find((line) => line.includes('heading'));
    expect(heading).toContain('    heading');
  });

  it('says so plainly when nothing matched', () => {
    expect(renderLayers(file, [])).toContain('no layers matched');
  });
});

/**
 * `hugsText` — the authoring half of T-27.
 *
 * The listing is where a pairing is chosen, so it is where the choice can
 * still be cheap to change.
 */
describe('flattenLayers — glyph-hugging text layers', () => {
  /**
   * `textAutoResize` sits inside `style` in the REST API, not on the node —
   * the Plugin API is the one that puts it on the node. `wrong-place` pins
   * that: reading the node level found undefined on every real TEXT node and
   * the marker silently never appeared.
   */
  const withStyle = (id: string, name: string, type: string, autoResize?: string) => ({
    ...node(id, name, type),
    style: { fontFamily: 'Gotham', fontSize: 32, ...(autoResize !== undefined ? { textAutoResize: autoResize } : {}) },
  });

  const hugFile: FigmaFile = {
    name: 'Sport-Specific Landing Page',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        node('1:1', 'Page', 'CANVAS', [
          withStyle('1:23', 'heading', 'TEXT', 'WIDTH_AND_HEIGHT'),
          withStyle('1:24', 'body', 'TEXT', 'HEIGHT'),
          withStyle('1:25', 'label', 'TEXT', 'NONE'),
          withStyle('1:26', 'card', 'FRAME', 'WIDTH_AND_HEIGHT'),
          { ...node('1:27', 'wrong-place', 'TEXT'), textAutoResize: 'WIDTH_AND_HEIGHT' },
        ]),
      ],
    },
  };

  const rows = flattenLayers(hugFile);
  const byName = (name: string) => rows.find((row) => row.name === name);

  it('flags a TEXT layer that shrink-wraps both axes', () => {
    expect(byName('heading')?.hugsText).toBe(true);
  });

  it('flags one that shrink-wraps only its height', () => {
    expect(byName('body')?.hugsText).toBe(true);
  });

  it('leaves a laid-out TEXT layer unflagged rather than flagged false', () => {
    expect(byName('label')?.hugsText).toBeUndefined();
  });

  it('never flags a node that is not TEXT', () => {
    expect(byName('card')?.hugsText).toBeUndefined();
  });

  it('reads it from style, not from the node', () => {
    expect(byName('wrong-place')?.hugsText).toBeUndefined();
  });

  it('marks the flagged rows in the listing, and only those', () => {
    const rendered = renderLayers(hugFile, rows).split('\n');
    expect(rendered.find((line) => line.includes('heading'))).toContain('hugs text');
    expect(rendered.find((line) => line.includes('label'))).not.toContain('hugs text');
  });
});
