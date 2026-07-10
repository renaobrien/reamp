import { describe, expect, it } from 'vitest';
import { formatDiagnostics } from '../src/main/diagnostics.js';
import { REPO_URL, buildFeedbackUrl } from '../src/main/feedback.js';

describe('buildFeedbackUrl', () => {
  it('targets the upstream repo new-issue page', () => {
    const url = new URL(buildFeedbackUrl());
    expect(url.origin + url.pathname).toBe(`${REPO_URL}/issues/new`);
  });

  it('prefills title, labels, body, and collapsed diagnostics', () => {
    const url = new URL(
      buildFeedbackUrl({
        title: 'Bars frozen on Spotify',
        labels: ['feedback', 'bug'],
        body: 'The spectrum stops moving after sleep/wake.',
        diagnostics: '- Reamp: 0.0.1\n- Mode: desktop-control',
      }),
    );
    expect(url.searchParams.get('title')).toBe('Bars frozen on Spotify');
    expect(url.searchParams.get('labels')).toBe('feedback,bug');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('The spectrum stops moving after sleep/wake.');
    expect(body).toContain('<details><summary>Diagnostics</summary>');
    expect(body).toContain('- Mode: desktop-control');
    expect(body.indexOf('spectrum')).toBeLessThan(body.indexOf('<details>'));
  });

  it('survives characters that need URL encoding', () => {
    const url = new URL(buildFeedbackUrl({ title: 'skin "Tron&Co" breaks 100%' }));
    expect(url.searchParams.get('title')).toBe('skin "Tron&Co" breaks 100%');
  });

  it('truncates oversized diagnostics instead of producing a broken URL', () => {
    const url = new URL(buildFeedbackUrl({ diagnostics: 'x'.repeat(50_000) }));
    const body = url.searchParams.get('body')!;
    expect(body.length).toBeLessThanOrEqual(6000);
    expect(body).toContain('[diagnostics truncated]');
  });

  it('omits empty params entirely', () => {
    const url = new URL(buildFeedbackUrl({}));
    expect(url.searchParams.has('title')).toBe(false);
    expect(url.searchParams.has('body')).toBe(false);
    expect(url.searchParams.has('labels')).toBe(false);
  });
});

describe('formatDiagnostics', () => {
  it('renders the markdown block with optional fields', () => {
    const md = formatDiagnostics({
      appVersion: '0.0.1',
      mode: 'desktop-control',
      os: 'Darwin 24.5.0',
      arch: 'arm64',
      captureStatus: 'granted',
      adapterStatus: ['spotify: authorized', 'apple-music: unauthorized'],
    });
    expect(md.split('\n')).toEqual([
      '- Reamp: 0.0.1',
      '- Mode: desktop-control',
      '- OS: Darwin 24.5.0 (arm64)',
      '- Audio capture: granted',
      '- Adapter spotify: authorized',
      '- Adapter apple-music: unauthorized',
    ]);
  });

  it('leaves optional fields out cleanly', () => {
    const md = formatDiagnostics({
      appVersion: '0.0.1',
      mode: 'desktop-control',
      os: 'Darwin 24.5.0',
      arch: 'arm64',
    });
    expect(md).not.toContain('Audio capture');
    expect(md).not.toContain('Adapter');
  });
});
