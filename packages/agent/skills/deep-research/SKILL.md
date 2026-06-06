---
name: deep-research
description: A multi-step workflow for answering open questions with current, cited web sources.
---

# Deep research

Use this when a question needs current, verifiable information from the web.

1. Plan with the `think` tool: break the question into 2-4 focused sub-questions.
2. For each sub-question, call `web_search` to find candidate sources.
3. Read the most relevant pages in full with `read_webpages_as_markdown`.
4. Cross-check key facts across at least two independent sources.
5. Synthesize a concise answer and always cite the source URLs you used.

Never fabricate facts or URLs. If the answer cannot be found, state which queries you tried and what is still missing.
