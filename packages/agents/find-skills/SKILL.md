---
name: find-skills
description: Helps users discover and install agent skills. Use when users ask "how to do X", "is there a skill for X", "can you do X", or want to extend agent capabilities. Triggered when users look for tools, templates, workflows, or skills in specific domains like design, testing, or deployment.
---

# Find Skills

Discover and install skills from the open agent skills ecosystem.

## When to Use

Use when any of these apply:

- User asks "how to do X" where X might be a common task covered by an existing skill
- User asks to "find a skill for X" or "is there a skill for X"
- User asks "can you do X" where X is a specialized capability
- User expresses interest in extending agent capabilities
- User wants to search for tools, templates, or workflows
- User mentions wanting help in a specific domain (design, testing, deployment, etc.)

## Skills CLI

`pnpm dlx skills` is the package manager for the open agent skills ecosystem. Skills are modular packages that extend agent capabilities with专业知识, workflows, and tools.

**Key commands:**

- `pnpm dlx skills find [query]` — Search skills interactively or by keyword
- `pnpm dlx skills add <package>` — Install a skill from GitHub or other sources
- `pnpm dlx skills check` — Check for skill updates
- `pnpm dlx skills update` — Update all installed skills

**Browse skill library:** https://skills.sh/

## How to Help Users Find Skills

### Step 1: Understand the Need

Identify:

1. Domain (e.g., React, testing, design, deployment)
2. Specific task (e.g., write tests, animate, review PRs)
3. Whether it's common enough to likely have an existing skill

### Step 2: Check the Leaderboard First

Before running CLI searches, check the [skills.sh leaderboard](https://skills.sh/) to see if there are well-known skills in this area. The leaderboard is sorted by total installs, surfacing the most popular and battle-tested options.

Top skills for web development:

- `vercel-labs/agent-skills` — React, Next.js, Web design (100K+ installs each)
- `anthropics/skills` — Frontend design, document processing (100K+ installs)

### Step 3: Search for Skills

If the leaderboard doesn't cover the user's need, run the find command:

```bash
pnpm dlx skills find [query]
```

Examples:

- "how to speed up my React app?" → `pnpm dlx skills find react performance`
- "can you help with PR review?" → `pnpm dlx skills find pr review`
- "I need to make a changelog" → `pnpm dlx skills find changelog`

### Step 4: Validate Quality Before Recommending

**Don't recommend a skill based only on search results.** Validate:

1. **Install count** — Prefer 1K+ installs; be cautious with <100
2. **Source reputation** — Official sources (`vercel-labs`, `anthropics`, `microsoft`) are more trustworthy than unknown authors
3. **GitHub stars** — Check the source repo; be skeptical of <100 stars

### Step 5: Present Options to User

When you find a suitable skill, tell the user:

1. Skill name and what it does
2. Install count and source
3. Installation command
4. Link to details on skills.sh

Example response:

```
I found a potentially suitable skill! "react-best-practices" provides Vercel engineering team's
React and Next.js performance optimization guide. (185K installs)

Install:
pnpm dlx skills add vercel-labs/agent-skills@react-best-practices

Details: https://skills.sh/vercel-labs/agent-skills/react-best-practices
```

### Step 6: Offer to Install

If the user agrees, install for them:

```bash
pnpm dlx skills add <owner/repo@skill> -g -y
```

`-g` is global install (user level), `-y` skips confirmation.

## Common Skill Categories

Consider these categories when searching:

| Category      | Example Queries                              |
|---------------|----------------------------------------------|
| Web Dev       | react, nextjs, typescript, css, tailwind      |
| Testing       | testing, jest, playwright, e2e                 |
| DevOps        | deploy, docker, kubernetes, ci-cd             |
| Documentation | docs, readme, changelog, api-docs            |
| Code Quality  | review, lint, refactor, best-practices       |
| Design        | ui, ux, design-system, accessibility         |
| Productivity  | workflow, automation, git                     |

## Search Tips

1. **Use specific keywords** — "react testing" is better than "testing" alone
2. **Try synonyms** — if "deploy" doesn't work, try "deployment" or "ci-cd"
3. **Check popular sources** — many skills come from `vercel-labs/agent-skills` or `ComposioHQ/awesome-claude-skills`

## No Skill Found

If no relevant skill exists:

1. Acknowledge no match was found
2. Offer to help directly with your general capabilities
3. Suggest the user can create one with `pnpm dlx skills init`

Example:

```
I searched for skills related to "xyz" but didn't find a match.
I can still help you do this directly! Want to get started?

If this is something you do often, you can create a skill yourself:
pnpm dlx skills init my-xyz-skill
```
