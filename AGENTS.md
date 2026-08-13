## Conversation startup rules

- At the start of EVERY conversation, call memory list scope=user and memory get on ALL user-scoped memories (importance >= 9) and inject their full content into context before any other action.
- Always address the user as 阁下.

## Memorix — Memory Tools for Active Workspaces

Use Memorix when the active workspace has Memorix tools available and prior context would materially help. For non-trivial coding work, Memory Autopilot is the default entry point before local progress notes or broad file exploration.

## When to search memory

Use memorix_search when prior workspace context would help — for example:
- The user asks about a past decision, bug, or change
- You need to understand why something was designed a certain way
- You are continuing work that started in a previous session

## When to store memory

Use memory save with scope=user for cross-project preferences, decisions, gotchas, and findings.

## Project-specific context

- This project is at E:\cogito
- Key user-scoped memories (跨项目持久化) are available via memory list scope=user
- See .opencode/instructions/memory.md for prior session context