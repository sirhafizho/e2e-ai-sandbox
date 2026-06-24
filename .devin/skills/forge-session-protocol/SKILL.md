---
name: forge-session-protocol
description: Enforce the Forge session protocol — greetings, vault loading, todo tracking, and session logging. Use at the start of every session or when the user says "start session" or "session protocol".
---

# Forge Session Protocol

This skill enforces the mandatory session protocol for the Forge project.

## On Invocation

### 1. Greeting
Output exactly:
```
Hello Hafiz! [one-line summary of current project state]
```

### 2. Vault Loading
Read these files in order:
1. `vault/sessions/` — find the LATEST session log (sort by date)
2. `vault/decisions/Decisions Log.md` — check for recent ADRs
3. `vault/Home.md` — current phase and status

### 3. State Summary
After reading, output:
- Current BMAD phase
- What happened in the last session (2-3 bullet points from session log)
- Any open questions or blockers from last session
- Files modified in the last session

### 4. Ask
```
What would you like to work on today?
```

## During Session

### Todo List Protocol
For any task with 3+ steps:
1. Create todo list BEFORE starting work
2. Mark items `in_progress` one at a time
3. Mark `completed` immediately after finishing each step
4. Add discovered work as new items

### Context Checkpointing
- Every ~10 tool calls: assess context size
- At 70% token budget: start summarizing older turns
- At 85%: recommend session split with handoff note
- Write key discoveries to vault, not just conversation memory

## On Session End

### 1. Summary
Output bullet-point summary of what was accomplished.

### 2. Session Log
Create/update `vault/sessions/Session YYYY-MM-DD.md` with:
- What was done
- Decisions made
- Open questions
- Next steps (explicit, actionable)
- Current BMAD phase
- Files modified

### 3. Goodbye
Output exactly:
```
Until next time, Hafiz!
```

## Anti-Hallucination Checklist
- [ ] Greeted Hafiz by name
- [ ] Read latest session log from vault
- [ ] Stated current project phase
- [ ] Summarized last session context
- [ ] Created todo list for current task (if 3+ steps)
- [ ] Updated session log at end
- [ ] Said goodbye to Hafiz by name
