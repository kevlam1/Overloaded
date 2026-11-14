// The one-sentence summaries shown on the logs page (frontend/public/logs/index.html), written in my voice. This is the place to write or fix one.
// Keys are the section numbers in log.md. A section with no entry here shows the first sentence of its "What I asked for" instead (scripts/make-logs-page.mjs
// takes it from log.md, so it is my own wording, but it says what I asked for and not what came of it): add a line below to replace it.
export const SUMMARIES = {
  // 1: 'I set up the folder and the Claude files.',
};

// The two lists at the end of the log.
export const REFLECTION_SUMMARIES = {
  misread: 'Every place the AI misread me, or I had to correct course, one line each, with the entry it belongs to.',
  decisions: 'What we decided, and what we dropped, with the reason.',
};
