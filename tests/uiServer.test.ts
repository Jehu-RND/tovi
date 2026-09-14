/**
 * UI server — routing, validation, and the token boundary.
 *
 * Drives a real server on an ephemeral port. No Figma network and no browser:
 * the routes that need those are exercised for their failure paths, which is
 * where the behaviour worth pinning down lives.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { startUiServer } from '../src/ui/server.js';

let server: Server;
let base: string;

beforeAll(async () => {
  // Port 0 asks the OS for a free one, so tests never collide with a real run.
  const started = await startUiServer({ port: 0 });
  server = started.server;
  base = started.url;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
});

describe('routing', () => {
  it('serves the UI at the root', async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>TOVI</title>');
  });

  it('404s an unknown route as JSON, not HTML', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toContain('No route');
  });

  it('binds loopback only', () => {
    expect(base.startsWith('http://127.0.0.1:')).toBe(true);
  });
});

describe('GET /api/health', () => {
  it('reports whether a token is present without disclosing it', async () => {
    const body = await (await fetch(`${base}/api/health`)).json() as Record<string, unknown>;
    expect(typeof body['hasToken']).toBe('boolean');
    // The token itself must never appear in any response.
    expect(JSON.stringify(body)).not.toContain(process.env['FIGMA_TOKEN'] ?? ' never ');
  });

  it('carries the default tolerances so the UI need not restate them', async () => {
    const body = await (await fetch(`${base}/api/health`)).json() as Record<string, unknown>;
    expect(body['defaultTolerances']).toMatchObject({ color: 2, fontWeight: 0, border: 0.5 });
  });
});

describe('GET /api/config', () => {
  it('returns a null config rather than failing when none was given', async () => {
    const body = await (await fetch(`${base}/api/config`)).json() as Record<string, unknown>;
    expect(body['config']).toBeNull();
    expect(body['error']).toBeNull();
  });
});

describe('POST /api/check', () => {
  async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${base}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  }

  it('rejects a config the CLI would also reject, with the same message', async () => {
    // A config authored in the UI has to be one that runs in CI, so the UI
    // validates through the very same validateConfig().
    const { status, json } = await post({
      config: {
        url: 'not-a-url', section: 'hero',
        viewport: { width: 1440, height: 900 }, elements: [],
      },
    });
    expect(status).toBe(400);
    expect(String(json['error'])).toContain('absolute URL');
  });

  it('rejects a section that names no configured element', async () => {
    const { status, json } = await post({
      config: {
        url: 'https://example.com/', figmaFileKey: 'k', section: 'nope',
        viewport: { width: 1440, height: 900 },
        elements: [{ figmaId: 'hero', nodeId: '1:1' }],
      },
    });
    expect(status).toBe(400);
    expect(String(json['error'])).toContain('must be listed in "elements"');
  });

  it('reports a missing config as an error rather than crashing', async () => {
    const { status, json } = await post({});
    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
  });
});

describe('GET /api/layers', () => {
  it('says what to do when no file key is available', async () => {
    const previous = process.env['FIGMA_FILE_KEY'];
    delete process.env['FIGMA_FILE_KEY'];
    try {
      const res = await fetch(`${base}/api/layers`);
      expect(res.status).toBe(400);
      expect(String((await res.json() as { error: string }).error)).toContain('file key');
    } finally {
      if (previous !== undefined) process.env['FIGMA_FILE_KEY'] = previous;
    }
  });

  it('rejects a non-positive depth before making any request', async () => {
    const res = await fetch(`${base}/api/layers?file=abc&depth=0`);
    expect(res.status).toBe(400);
    expect(String((await res.json() as { error: string }).error)).toContain('positive integer');
  });
});

/**
 * The page's JavaScript is written inside a template literal, so every
 * backslash escape and backtick in it has to survive one extra round of
 * interpretation on the way out. Getting that wrong does not fail the build,
 * the typecheck, or any other test — it ships a page whose script dies on the
 * first line the browser parses, and the UI silently does nothing.
 *
 * This has now happened twice: a backtick in a comment, and `split('\n\n')`
 * emitting a real newline inside a string literal. Both were found by a person
 * clicking the page, which is too late and too expensive.
 */
describe('the served page parses as JavaScript', () => {
  it('has a script the browser can actually run', async () => {
    const html = await (await fetch(base)).text();

    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);

    for (const source of scripts) {
      // Compiling is enough: it raises the same SyntaxError the browser would
      // without running anything or touching the DOM.
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it('closes every string it opens, even across escapes', async () => {
    const html = await (await fetch(base)).text();
    // A literal newline inside single quotes is the exact shape of the bug.
    expect(html).not.toMatch(/'[^'\n]*\n[^'\n]*'\s*\)/);
  });
});
