# Gemini Prompt Anti-Patterns

Avoid these when prompting Gemini.

## Vague task framing

Bad:

```text
Take a look at this and let me know what you think.
```

Better:

```xml
<task>
Review this change for material correctness and regression risks.
</task>
```

## Missing output contract

Bad:

```text
Investigate and report back.
```

Better:

```xml
<output_contract>
Return:
1. root cause
2. evidence
3. smallest safe next step
</output_contract>
```

## No follow-through default

Bad:

```text
Debug this failure.
```

Better:

```xml
<follow_through_policy>
Keep going until you have enough evidence to identify the root cause confidently.
</follow_through_policy>
```

## Asking for more effort instead of a better contract

Bad:

```text
Think harder and be very thorough.
```

Better:

```xml
<verification_loop>
Before finalizing, verify that the answer matches the observed evidence and task requirements.
</verification_loop>
```

## Mixing unrelated jobs into one run

Bad:

```text
Review this diff, fix the bug you find, update the docs, and suggest a roadmap.
```

Better:
- Run review first.
- Run a separate fix prompt if needed.
- Use a third run for docs or roadmap work.

## Unsupported certainty

Bad:

```text
Tell me exactly why production failed.
```

Better:

```xml
<grounding_rules>
Ground every claim in the provided context.
If a point is an inference, label it clearly.
</grounding_rules>
```

## Not leveraging the large context window

Bad:

```text
Here is the relevant snippet: [50 lines of code]
```

Better: Include full file contents when they are relevant. Gemini's 1M token context window is a strength — use it. Truncated context leads to missed dependencies and incorrect conclusions.

## Using prose instructions instead of XML blocks for contracts

Bad:

```text
Please make sure you verify your answer carefully and don't make things up.
```

Better:

```xml
<verification_loop>
Before finalizing, verify the result against the task requirements.
If a check fails, revise the answer instead of reporting the first draft.
</verification_loop>

<grounding_rules>
Ground every claim in the provided context.
</grounding_rules>
```

XML blocks have stable internal structure that Gemini follows more reliably than prose instructions.
