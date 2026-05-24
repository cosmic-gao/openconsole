---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to build a skill from scratch, edit or optimize an existing skill, run evals to test skills, benchmark skill performance with variance analysis, or optimize skill descriptions to improve trigger accuracy.
---

# Skill Creator

A skill for creating new skills and iteratively improving them.

The workflow is roughly:

- Decide what the skill should do and how
- Write a skill draft
- Write test prompts and have a claude-with-access-to-the-skill run them
- Help users evaluate results qualitatively and quantitatively
  - While tests run in the background, draft a quantitative evaluation plan if none exists (or review/modify existing ones). Then explain the approach to the user
  - Use `eval-viewer/generate_review.py` to present results for user review, including quantitative metrics
- Rewrite the skill based on user feedback (and issues revealed by quantitative benchmarks)
- Repeat until satisfied
- Scale up the test set and run大规模

Your job when using this skill is to figure out where the user is in this workflow and help them advance. If they say "I want to build a skill for X", you can help narrow scope, write drafts, create test cases, determine evaluation methods, run all prompts, and iterate.

Another case: they already have a skill draft. Then you go straight to evaluation/iteration.

Of course, flexibility first — if they say "don't run a bunch of evals, just chat with me", do that.

After the skill is done (order is flexible), you can also run the skill description optimizer — a dedicated script for improving skill triggers.

## Communicating with Users

Users of the skill creator vary widely in programming familiarity. Some are new to CLI tools, others are very comfortable with computers.

Watch for contextual cues to gauge appropriate terminology. Default guidance:

- "evaluation" and "benchmark" — borderline but OK
- "JSON" and "assertion" — explain if the user doesn't clearly demonstrate understanding

If unsure, brief explanations are fine. When in doubt, add a short definition.

---

## Creating a Skill

### Capture Intent

Understand user intent first. The current conversation may already contain the workflow they want to crystallize into a skill (e.g., they say "make this into a skill"). If so, extract answers from conversation history — tools used, step order, user corrections, observed input/output formats. The user may need to fill gaps; confirm before proceeding.

1. What should the skill enable Claude to do?
2. When should it trigger? (what user phrasing/scenarios)
3. What is the expected output format?
4. Should test cases validate the skill? **Objectively verifiable** outputs (file conversion, data extraction, code generation, fixed process steps) are good for test cases; **subjective** outputs (writing style, art) typically don't need them. Suggest a default approach based on skill type, but let the user decide.

### Interview and Research

Proactively ask about edge cases, input/output formats, example files, success criteria, and dependencies. Finalize this before writing test prompts.

Check available MCPs — if helpful for research (searching docs, finding similar skills, checking best practices), use subagents for parallel research, or search in the main thread. Come with context to reduce user burden.

### Write SKILL.md

Based on user interviews, fill in:

- **name**: skill identifier
- **description**: when to trigger and what it does. **This is the primary trigger mechanism** — include both what the skill does and specifically when to use it. Put all "when to use" info in the description, **not** in the body. Note: Claude currently tends to under-trigger — it doesn't use skills when it should. To counteract this, make the skill description slightly "aggressive". For example, instead of "How to build a simple fast dashboard...", write "How to build a simple fast dashboard... Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: required tools, dependencies (optional, rarely needed)
- **skill body :)**

### Skill Writing Guide

#### Skill Structure

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── bundled resources (optional)
    ├── scripts/    - executable code for deterministic/repetitive tasks
    ├── references/  - documentation loaded on demand
    └── assets/     - files used in output (templates, icons, fonts)
```

#### Progressive Disclosure

Skills use a three-layer loading mechanism:

1. **Metadata** (name + description) — always in context (~100 chars)
2. **SKILL.md body** — loaded when skill triggers (ideal <500 lines)
3. **Bundled resources** — loaded on demand (unlimited; scripts can execute without loading the body)

Line counts are approximate; longer is fine if needed.

**Key patterns:**

- Keep SKILL.md under 500 lines; when approaching the limit, add a layer and explicitly tell the calling model where to look next
- Clearly reference files in SKILL.md, explaining when to read them
- Add a table of contents for large reference files (>300 lines)

**Organize by domain:** When a skill supports multiple domains/frameworks, organize by variant:

```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

Claude only reads the relevant reference file.

#### No Surprises Principle

Skills must not contain malicious code, exploits, or anything that could compromise system security. Skill content should match its described intent and not surprise users. Don't cooperate with misleading skills or those designed for unauthorized access, data exfiltration, or other malicious activities. "Role-play as XYZ" is OK.

#### Writing Patterns

Instructions should primarily use imperative mood.

**Define output formats** like this:

```markdown
## Report Structure

ALWAYS use this template:

# [Title]

## Executive summary

## Key findings

## Recommendations
```

**Example patterns** — examples are useful. Write like this (adjust "Input"/"Output" labels as needed):

```markdown
## Commit Message Format

**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Writing Style

Explain **why** things matter to the model, not just a bunch of rigid MUSTs. Use theory of mind to make skills通用 (general-purpose) rather than bound to specific examples. Write a draft, then revisit with fresh eyes and improve.

### Test Cases

After writing the skill draft, think of 2-3 realistic test prompts — things real users would actually say. Show the user: "Here are a few test cases I'd like to run. Do these look right? Should we add any?" Then run them.

Store test cases in `evals/evals.json`. Don't write assertions yet — just prompts. Assertions come later during runtime.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "user's task prompt",
      "expected_output": "expected result description",
      "files": []
    }
  ]
}
```

Full schema (including the `assertions` field to be added later) in `references/schemas.md`.

## Running Test Cases and Evaluating

This section is a **continuous workflow** — don't stop halfway. **Don't** use `/skill-test` or other testing skills.

Results go in `<skill-name>-workspace/`, a sibling directory to the skill. Workspaces are organized by iteration (`iteration-1/`, `iteration-2/`), and each iteration has one directory per test case (`eval-0/`, `eval-1/`). **Don't** create these in advance — create as you go.

### Step 1: Spawn All Runs in the Same Round

Each test case spawns two subagents in the same round — one with the skill, one without. **Key point**: don't spawn with-skill, wait for it to finish, then go back and run baseline. Launch everything at once and let them complete roughly simultaneously.

**With-skill run:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Output to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- What to save: <what the user cares about — e.g., ".docx file", "final CSV">
```

**Baseline run** (same prompt, but baseline depends on scenario):

- **Creating a new skill**: completely without skill. Same prompt, no skill path, save to `without_skill/outputs/`
- **Improving existing skill**: use old version. Snapshot the skill before editing (`cp -r <skill-path> <workspace>/skill-snapshot/`), then point baseline subagent to the snapshot. Save to `old_skill/outputs/`

Write an `eval_metadata.json` for each test case (assertions empty for now). Give each eval a descriptive name based on what it's testing — not just "eval-0". Directory names use this name too. If this iteration uses new/modified eval prompts, create this file for each new eval directory — don't assume it inherits from previous iteration.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive name",
  "prompt": "user's task prompt",
  "assertions": []
}
```

### Step 2: Draft Assertions While Tests Run

Don't wait for results — use this time productively. Draft quantitative assertions for each test case and explain them to the user. If `evals/evals.json` already has assertions, review them and explain what each checks.

Good assertions are **objectively verifiable** and have **descriptive names** — they should read clearly in the benchmark viewer, immediately clear on what each checks. Subjective skills (writing style, design quality) are better suited for qualitative evaluation — don't force assertions onto things that need human judgment.

After drafting assertions, update `eval_metadata.json` and `evals/evals.json`. Also explain to the user what they'll see in the viewer — both qualitative outputs and quantitative benchmarks.

### Step 3: Record Timing Data When Runs Complete

When each subagent task completes, you'll receive a notification with `total_tokens` and `duration_ms`. **Immediately** save this data to the run directory's `timing.json`:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

This is the only capture opportunity — it comes through task notifications, nowhere else persists. Handle each notification as it arrives; don't try to batch them.

### Step 4: Grade, Aggregate, and Start Viewer

After all runs complete:

1. **Grade each run** — spawn a grader subagent (or grade in the main thread), read `agents/grader.md`, and match each assertion against output. Save results to `grading.json` in each run directory. The `expectations` array in grading.json must use fields `text`, `passed`, `evidence` (**not** `name`/`met`/`details` or other variants) — the viewer depends on these exact field names. For assertions that can be programmatically checked, write a script to run them rather than eyeballing — scripts are faster, more reliable, and reusable across iterations.

2. **Aggregate into benchmark** — run the aggregation script from the skill-creator directory:

   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```

   Produces `benchmark.json` and `benchmark.md` with pass_rate, time, tokens per config, with mean ± stddev and delta. For manual benchmark.json generation, schema in `references/schemas.md`. Each with_skill version goes before its corresponding baseline.

3. **Run an analyst pass** — read benchmark data and surface patterns that aggregated statistics might hide. See `agents/analyzer.md` ("Analyzing Benchmark Results" section) — e.g., "assertions that pass regardless of skill" (no discriminative power), high-variance evals (may be unstable), time/token tradeoffs.

4. **Start viewer** with both qualitative outputs and quantitative data:

   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```

   For iteration 2+, also pass `--previous-workspace <workspace>/iteration-<N-1>`.

   **Cowork/headless**: if `webbrowser.open()` isn't available or the environment has no display, use `--static <output_path>` to write a standalone HTML file instead of starting a server. When user clicks "Submit All Reviews", feedback downloads as `feedback.json`. Copy it to the workspace directory for the next iteration.

   Note: use `generate_review.py` to generate the viewer; don't write custom HTML.

5. **Tell the user** something like: "Results are open in your browser. Two tabs — 'Outputs' lets you click through test cases and leave feedback, 'Benchmark' shows the quantitative comparison. Take a look and let me know when you're done."

### What Users See in the Viewer

The "Outputs" tab shows one test case at a time:

- **Prompt**: the given task
- **Output**: files produced by the skill; inline render if possible
- **Previous Output** (iteration 2+): collapsed, shows last iteration's output
- **Formal Grades** (if grading ran): collapsed, shows pass/fail per assertion
- **Feedback**: text box, auto-saves on input
- **Previous Feedback** (iteration 2+): prior comments shown below text box

The "Benchmark" tab shows statistical summary: pass rate, time, token usage per config, broken down by eval plus analyst observations.

Navigate with prev/next buttons or arrow keys. When done, click "Submit All Reviews" to save all feedback to `feedback.json`.

### Step 5: Read Feedback

After user says "done looking", read `feedback.json`:

```json
{
  "reviews": [
    {
      "run_id": "eval-0-with_skill",
      "feedback": "Chart is missing axis labels",
      "timestamp": "..."
    },
    { "run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..." },
    { "run_id": "eval-2-with_skill", "feedback": "Perfect, loved it", "timestamp": "..." }
  ],
  "status": "complete"
}
```

Empty feedback means the user felt fine about it. Focus changes on the test cases with specific complaints.

Kill the viewer process when done:

```bash
kill $VIEWER_PID 2>/dev/null
```

---

## Improving Skills

This is the core loop. You've run test cases, the user reviewed results, and now you refine the skill based on their feedback.

### How to Think About Improvements

1. **Generalize from feedback.** Think big picture: we're building skills that could be used millions of times (maybe literally) across varied prompts. Iterating on few examples with the user is fast — they know these examples well and can evaluate new outputs quickly. But if the skill you build together only works for these few examples, it's **useless**. Rather than堆零碎过拟合 (accumulating brittle overfitted modifications) and rigid MUSTs, when hitting stubborn problems, **try a different approach** — a different metaphor, or suggest another way of working. Trial cost is low; maybe you'll stumble onto something great.

2. **Keep prompts lean.** Remove anything not doing work. Read **transcripts**, not just final outputs — if the skill makes the model waste time on useless things, try deleting that section.

3. **Explain "why".**拼命 (go all out) to explain the **why** behind each requirement. Today's LLMs are **smart** — they have good theory of mind and can exceed rigid instructions if given a good framework. Even if user feedback is brief or emotional, really understand the task, why they wrote it that way, what they actually wrote, and transmit that understanding into instructions. If you find yourself writing lots of ALWAYS or NEVER, or using ultra-rigid structures, that's a yellow light — reorganize and explain the reasoning, help the model understand why you require this. This is more human, more powerful, and more effective.

4. **Find cross-case repetition.** Read test run transcripts and note if subagents independently wrote similar helper scripts or did the same multi-step processing. If all 3 test cases had subagents writing `create_docx.py` or `build_chart.py`, that's a strong signal — the script should be bundled into the skill. Write once, put in `scripts/`, have the skill call it. No more repeated wheel reinvention.

This matters (we're trying to create billions of dollars of economic value annually!), and your thinking time isn't the bottleneck. Take time to think deeply. Write and rewrite drafts first, then revisit with fresh eyes. Get into the user's head as much as possible — understand what they want and need.

### Iteration Loop

After modifying the skill:

1. Apply changes to the skill
2. Re-run all test cases into new `iteration-<N+1>/` directory, including baseline. For new skills, baseline is always `without_skill` (no skill) — this remains constant across iterations. For improving existing skills, use your judgment for which baseline makes sense: the original version the user brought, or the previous iteration's version
3. Start reviewer with `--previous-workspace` pointing to the previous round
4. Wait for user review
5. Read new feedback, modify, iterate

Until any of:

- User says they're satisfied
- All feedback is empty (everything looked good)
- You're not making meaningful progress

---

## Advanced: Blind Comparison

When you want to more rigorously compare two versions of a skill (e.g., user asks "did the new version actually improve?"), there's a blind comparison system. See `agents/comparator.md` and `agents/analyzer.md`. Basic idea: give two outputs to an independent agent **without telling it which is which**, and let it judge quality. Then analyze why the winner won.

Optional, requires subagents, most users don't need it. Human review loops are usually sufficient.

---

## Description Optimization

The `description` field in SKILL.md frontmatter is the primary mechanism for determining whether Claude triggers the skill. After creating or improving a skill, proactively offer to optimize the description to improve trigger accuracy.

### Step 1: Generate Trigger Eval Queries

Create 20 eval queries — mix of should-trigger and should-not-trigger. Store as JSON:

```json
[
  { "query": "user prompt", "should_trigger": true },
  { "query": "another prompt", "should_trigger": false }
]
```

Queries must be **real** — things Claude Code or Claude.ai users would actually type. Not abstract requests, but specific, detailed ones. Include file paths, user work/situation context, column names and values, company names, URLs, background stories. Can be lowercase, have abbreviations, typos, or colloquialisms. Mixed lengths, **focus on edge cases** over black-and-white ones (user will confirm later).

Bad: `"Format this data"`, `"Extract text from PDF"`, `"Create a chart"`

Good: `"My boss just sent me this xlsx file (in my downloads, called something like 'Q4 sales final FINAL v2.xlsx'), she wants me to add a column showing profit margin percentage. Revenue should be in column C, costs in column D?"`

**should-trigger queries** (8-10): cover variety of expressions for the same intent — some formal, some casual. Include cases where user doesn't explicitly mention the skill name or file type but clearly needs it. Pack in uncommon usages, cases competing with other skills where this one should win.

**should-not-trigger queries** (8-10): most valuable when **near misses** — queries that share keywords or concepts with the skill but actually need something different. Think adjacent domains, ambiguous phrasing (naive keyword match would trigger but shouldn't), queries that touch what the skill does but where other tools are more appropriate in context.

Key pitfall to avoid: don't make should-not-trigger queries **obviously irrelevant**. "Write a fibonacci function" as a negative example for a PDF skill is **too easy** — tests nothing. Negatives must be **genuinely misleading**.

### Step 2: User Review

Present the eval set to the user using an HTML template:

1. Read template `assets/eval_review.html`
2. Replace placeholders:
   - `__EVAL_DATA_PLACEHOLDER__` → JSON array of eval items (no quotes — this is JS variable assignment)
   - `__SKILL_NAME_PLACEHOLDER__` → skill name
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` → current skill description
3. Write to temp file (e.g., `/tmp/eval_review_<skill-name>.html`) and open: `open /tmp/eval_review_<skill-name>.html`
4. User can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set"
5. File downloads to `~/Downloads/eval_set.json` — check **latest version** in Downloads (may have `eval_set (1).json` etc.)

This step matters — poor eval queries lead to poor descriptions.

### Step 3: Run Optimization Loop

Tell the user: "This will take a while — I'll run the optimization loop in the background and check progress periodically."

Save eval set to workspace, then run in background:

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

Use `--model` with the model ID from your system prompt (the one powering this session) so trigger testing matches user experience.

Periodically tail output during the run and update the user on current iteration and scores.

This handles the full optimization loop automatically. It splits the eval set 60% train, 40% holdout, evaluates the current description (3 runs per query for reliable trigger rates), then has Claude propose improvements based on failure cases. It re-evaluates each new description on both train and test sets, up to 5 iterations. Opens browser with HTML report of each iteration's results when done, returns JSON with `best_description` selected by **test** set score (not train, to avoid overfitting).

### How Skill Triggering Works

Understanding the triggering mechanism helps design better eval queries. Skills appear in Claude's `available_skills` list with name + description, and Claude decides whether to consult the skill based on the description. Key point: **Claude only consults skills on tasks it can't easily handle itself** — "read this PDF" might not trigger any skill even with a perfect description because Claude handles it directly with basic tools. Complex, multi-step, professional queries reliably trigger skills when descriptions match.

This means eval queries need **substantial content** where Claude would genuinely benefit from consulting the skill. "Read file X" is a poor test case — no description will make it trigger.

### Step 4: Apply Results

Take `best_description` from JSON output and update the skill's SKILL.md frontmatter. Show user before/after and report scores.

---

### Packaging and Presenting (only if `present_files` tool available)

Check if you have the `present_files` tool. **Skip if not.** **If you do**, package the skill and present the .skill file to the user:

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

After packaging, tell the user the path to the output `.skill` file they can install.

---

## Claude.ai Specific Notes

On Claude.ai, core workflow is the same (draft → test → review → improve → repeat), but some mechanisms change since Claude.ai has no subagents. Adaptations:

**Running test cases**: no subagents means no parallel execution. Read the skill's SKILL.md for each test case yourself, then personally complete the test prompt following instructions. One at a time. Less rigorous than with subagents (you're both writing the skill and running it, context isn't independent), but human review steps compensate. **Skip baseline run** — just complete the task using the skill as requested.

**Reviewing results**: if you can't open a browser (Claude.ai VM has no display, or on a remote server), **skip the browser reviewer entirely**. Present results directly in the conversation. Show prompt and output for each test case. If output is a file the user needs to see (e.g., .docx, .xlsx), save to filesystem and tell them the path for download. Inline ask for feedback: "What do you think? Anything you'd change?"

**Benchmark**: skip quantitative benchmark — it requires baseline comparison, meaningless without subagents. Focus on user's qualitative feedback.

**Iteration loop**: same as before — modify skill, re-run test cases, ask for feedback — just no browser reviewer in between. If filesystem is available, still organize by iteration directories.

**Description optimization**: requires `claude` CLI tool (`claude -p`), only available in Claude Code. Skip on Claude.ai.

**Blind comparison**: requires subagents. Skip.

**Packaging**: `package_skill.py` works anywhere with Python and filesystem. On Claude.ai you can run it and the user downloads the output `.skill` file.

**Updating existing skill**: user may ask to **update** rather than create new. In this case:

- **Keep original name**. Note the skill directory name and `name` frontmatter field — keep unchanged. If installed skill is `research-helper`, output `research-helper.skill` (**not** `research-helper-v2`)
- **Copy to writable location before editing**. Installed skill path may be read-only. Copy to `/tmp/skill-name/` and edit there, package from the copy
- **If manually packaging, stage in `/tmp/` first**, then copy to output — direct writes may fail due to permissions

---

## Cowork Specific Notes

If you're in Cowork, key things to know:

- You have subagents, so main workflow (parallel spawn of test cases, baseline runs, grading, etc.) all work. (Though if you seriously hit timeout issues, running test prompts serially is OK.)
- You **don't** have a browser or display. When generating the eval viewer, use `--static <output_path>` to write standalone HTML instead of starting a server. Then give the user a link they can open the HTML.
- For some reason, Cowork setup seems to make Claude not generate eval viewers after running tests, so **repeat**: whether in Cowork or Claude Code, after running tests **always** generate eval viewer for humans to review cases before you review and try to improve the skill, **use `generate_review.py`** (don't write custom HTML). Sorry for the caps — **generate the eval viewer first**, then evaluate inputs. Get examples in front of humans ASAP!
- Feedback mechanism is different: since there's no running server, the viewer's "Submit All Reviews" button downloads `feedback.json` as a file. You can read from there (may need to request access first)
- Packaging works — `package_skill.py` only needs Python and filesystem
- Description optimization (`run_loop.py` / `run_eval.py`) should work in Cowork since it calls `claude -p` via subprocess, no browser needed, but **wait until skill is fully done and user agrees it's in good shape**
- **Updating existing skill**: user may ask to update rather than create new. Follow update guidance in the Claude.ai section above

---

## Reference Files

The `agents/` directory contains instructions for dedicated subagents. Read these when spawning related subagents.

- `agents/grader.md` — how to match assertions against outputs for evaluation
- `agents/comparator.md` — how to do blind A/B comparison of two outputs
- `agents/analyzer.md` — how to analyze why one version beats another

The `references/` directory contains supplementary documentation:

- `references/schemas.md` — JSON structure for evals.json, grading.json, etc.

---

## Core Loop Recap

The core loop, emphasized:

- Figure out what the skill is about
- Draft or edit the skill
- Have claude-with-access-to-the-skill run test prompts
- Evaluate outputs together with the user:
  - Create benchmark.json and run `eval-viewer/generate_review.py` to help user review
  - Run quantitative evaluation
- Repeat until both you and the user are satisfied
- Package final skill for user delivery

Please add these steps to the TodoList if you have one, don't forget. On Cowork, **specifically** put "create evals JSON and run `eval-viewer/generate_review.py` to have humans review test cases" in the TodoList, ensure this step happens.

Good luck!
