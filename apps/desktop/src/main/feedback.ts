/**
 * Feedback button plumbing: builds a prefilled new-issue URL on the
 * upstream repo. No tokens, no API, nothing sent silently; the user's
 * browser opens with the draft and they choose whether to submit. The
 * Help menu and the M2 settings pane both call this via
 * shell.openExternal(buildFeedbackUrl(...)).
 */

export const REPO_URL = 'https://github.com/renaobrien/reamp';

/** GitHub truncates very long prefill URLs; keep the body comfortably under it. */
const MAX_BODY_CHARS = 6000;
const TRUNCATION_NOTE = '\n\n[diagnostics truncated]';

export interface FeedbackOptions {
  title?: string;
  /** Free-text from the user, if the UI collected any. */
  body?: string;
  labels?: string[];
  /** Preformatted diagnostics markdown, appended in a collapsed block. */
  diagnostics?: string;
}

export function buildFeedbackUrl(opts: FeedbackOptions = {}): string {
  const url = new URL(`${REPO_URL}/issues/new`);

  if (opts.title !== undefined && opts.title.length > 0) {
    url.searchParams.set('title', opts.title);
  }
  if (opts.labels !== undefined && opts.labels.length > 0) {
    url.searchParams.set('labels', opts.labels.join(','));
  }

  const sections: string[] = [];
  if (opts.body !== undefined && opts.body.length > 0) sections.push(opts.body);
  if (opts.diagnostics !== undefined && opts.diagnostics.length > 0) {
    sections.push(
      ['<details><summary>Diagnostics</summary>', '', opts.diagnostics, '', '</details>'].join(
        '\n',
      ),
    );
  }
  let body = sections.join('\n\n');
  if (body.length > MAX_BODY_CHARS) {
    body = body.slice(0, MAX_BODY_CHARS - TRUNCATION_NOTE.length) + TRUNCATION_NOTE;
  }
  if (body.length > 0) url.searchParams.set('body', body);

  return url.toString();
}
