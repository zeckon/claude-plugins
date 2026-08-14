---
description: Create a rich, self-contained interactive HTML explanation of a code change, diff, branch, or pull request.
when_to_use: Use when the user wants to understand not just what changed, but why it changed, how the surrounding system works, and whether they have understood the change.
---

# Explain Diff

Create a rich, interactive, self-contained HTML document that teaches the reader a specified code change, diff, branch, or pull request.

The goal is **understanding, not merely summarization**.

The explanation should help the reader answer:

1. What was the system doing before?
2. What problem or limitation motivated this change?
3. What is the core idea behind the change?
4. How does the new implementation work?
5. What important trade-offs, edge cases, and consequences does it introduce?
6. Can I demonstrate that I actually understand the change?

---

## 1. Investigate Before Explaining

Do not explain the diff in isolation.

First inspect the repository and relevant surrounding code to build enough context to explain the change accurately.

Explore, as appropriate:

- Files modified by the change
- Callers and consumers of modified functions/classes
- Implementations and interfaces they depend on
- Relevant types, schemas, models, and configuration
- Tests
- Related UI or API code
- Data flow between components
- Existing abstractions that explain why the change is structured this way
- Relevant documentation or comments
- Git history when it helps explain intent

Do not unnecessarily explore the entire repository.

Follow the dependency and data-flow paths that are relevant to understanding the change.

When useful, inspect the history of changed code to understand:

- Why the old implementation existed
- What problem led to the change
- Whether the change is a bug fix, refactor, feature, optimization, or architectural change
- Important constraints or previous design decisions

### Evidence and uncertainty

Distinguish clearly between:

- **What the code demonstrates**
- **What can reasonably be inferred**
- **What is uncertain**

Do not invent motivations, requirements, or architectural intent that cannot be supported by:

- The repository
- Commit history
- PR description
- Tests
- Documentation
- Other available evidence

If something is unclear, say so explicitly.

---

## 2. Understand the Scope of the Change

Before writing the explanation, determine the actual scope of the change.

Identify:

- The entry point of the change
- The main components affected
- The important downstream effects
- New behavior
- Removed behavior
- Modified behavior
- User-visible consequences
- API or data-contract changes
- Persistence or state changes
- Test coverage
- Configuration changes

Do not begin writing until you can explain this chain clearly.

---

## 3. Structure of the Explanation

The generated HTML document should contain the following sections.

### Overview

Start with a concise explanation of:

- What changed
- Why it matters
- The most important architectural or behavioral difference
- A one-paragraph mental model of the change

The reader should understand the basic story before entering the detailed sections.

Include a compact Before → After summary.

For example:

| Before | After |
|---|---|
| Old behavior | New behavior |
| Old data flow | New data flow |
| Old limitation | New capability |

Keep this section short.

## 4. Background

Explain the existing system needed to understand the change.

Use two levels of explanation.

### Beginner Background

Explain the relevant concepts from first principles.

Assume the reader may be unfamiliar with:

- The architecture
- Domain concepts
- Components involved
- Data being passed around
- Why the existing design works the way it does

Explain only concepts relevant to the change.

This section should be skippable for experienced readers.

Clearly label it as foundational context.

### Change-Specific Background

Then narrow the explanation to the exact pieces of the system touched by the change.

Explain:

- Relevant components
- Responsibilities
- Data flow
- Important abstractions
- Existing constraints
- Where the old behavior lives
- How the relevant pieces interact

Do not explain unrelated parts of the application.

## 5. Problem

Explain the problem that the change addresses.

Show:

- What happened before
- Why the previous behavior was insufficient
- A concrete example
- The failure mode or limitation
- Why the problem matters
- Why obvious alternatives may not be sufficient, when relevant

Use a small, concrete example wherever possible.

For example:

> Suppose the system receives X and needs to produce Y. Before this change, it does A, which works for the normal case but breaks when B happens.

The reader should understand why the change was necessary.

Do not simply state:

> "This PR fixes X."

Explain why X was a problem.

## 6. Intuition

Explain the core idea behind the solution without getting lost in implementation details.

The reader should be able to understand the change without reading the code.

Use:

- Concrete toy data
- Small examples
- Before/after comparisons
- Visual diagrams
- Simplified representations of the system
- Analogies when they genuinely clarify the concept

Focus on the essential insight.

If the implementation contains complexity that is incidental to the core idea, explain the idea first and defer those details to the Code section.

A useful test:

> If the reader remembers only one thing from this document, what should it be?

Make that idea obvious.

## 7. System / Data Flow

When useful, provide a visual explanation of how information moves through the system.

Show things such as:

- Request → handler → service → database
- UI → state → API → backend
- Event → queue → worker → persistence
- Input → transformation → output
- Component → component → component

Use example data in the diagram.

For example, conceptually:

```
User request
     ↓
API handler
     ↓
Validation
     ↓
Service
     ↓
Database
     ↓
Response
```

However:

**Never render diagrams using ASCII art.**

The above is only an illustration of the conceptual flow.

The actual HTML must use HTML/CSS elements to represent the components and connections.

Include concrete example values where useful:

- Request: `{ id: 42 }`
- Component A transforms the request
- Component B performs a lookup
- Database returns a record
- Final response is produced

The diagram should explain behavior, not merely reproduce the module hierarchy.

## 8. Before vs After

Show the most important behavioral or architectural differences.

Use a clear comparison.

Possible dimensions include:

- Architecture
- Data flow
- API behavior
- State transitions
- Error handling
- Performance
- User-visible behavior
- Persistence
- Dependencies

Prefer concrete behavior over vague descriptions.

For example:

| Aspect | Before | After |
|---|---|---|
| Input | ... | ... |
| Processing | ... | ... |
| State | ... | ... |
| Output | ... | ... |
| Failure behavior | ... | ... |

Only include dimensions relevant to the change.

## 9. Code

Walk through the actual code changes at a high level.

Do not simply reproduce the diff line by line.

Group related changes into meaningful concepts.

For each major change, explain:

- What changed
- Where it changed
- Why it changed
- How it works
- What other code depends on it
- What behavior it changes
- Important trade-offs or edge cases

Use short, carefully selected code excerpts.

Do not overwhelm the reader with unchanged code.

### Code excerpt rules

When showing code:

- Prefer the smallest useful excerpt
- Include enough surrounding context to understand it
- Explain the important lines
- Connect the excerpt back to the mental model
- Avoid dumping entire files
- Avoid reproducing the entire diff
- Use the actual repository code rather than inventing simplified code when the real code is understandable

If simplification is necessary, clearly label the example as simplified.

## 10. Detailed Walkthrough

If the change is sufficiently complex, trace one or more realistic examples through the new implementation.

For example:

1. Input arrives
2. Validation occurs
3. State changes
4. Function A calls function B
5. Data is transformed
6. Persistence occurs
7. Response is returned

Use example values throughout the walkthrough.

For a request such as:

- `userId = 42`
- `status = "pending"`

show how that data changes as it passes through the relevant parts of the system.

The reader should be able to mentally execute the system.

For asynchronous or event-driven systems, explain:

- What triggers the process
- Which component owns each step
- What is synchronous
- What is asynchronous
- Where state is persisted
- What happens on failure
- What happens on retry

## 11. Edge Cases and Trade-offs

Explain important cases that are easy to miss.

Include, when relevant:

- Empty input
- Invalid input
- Errors
- Race conditions
- Concurrency
- Retries
- Partial failure
- Backwards compatibility
- State transitions
- Performance implications
- Memory implications
- Security implications
- API compatibility
- Migration concerns
- Data consistency
- Ordering
- Idempotency

Do not manufacture edge cases that are irrelevant to the implementation.

Explain meaningful trade-offs rather than presenting the new implementation as universally superior.

Use callouts for particularly important cases.

For example:

> **Trade-off:** The new approach reduces X but introduces Y because...

## 12. Testing

Explain how the change is verified.

Cover:

- Tests added
- Tests modified
- Existing tests that protect relevant behavior
- What behavior each important test proves
- Important cases not covered by tests
- How the test setup relates to the implementation

If there are no relevant tests, explicitly say so.

Where useful, show a small example of the test scenario.

Do not claim that behavior is tested if the repository does not actually contain such tests.

## 13. Quiz

Create five interactive multiple-choice questions that test genuine understanding of the change.

### Requirements

Each question must:

- Be medium difficulty
- Require understanding of the actual change
- Avoid trick wording
- Have 3–5 answer choices
- Have exactly one correct answer
- Provide immediate feedback
- Explain why the selected answer is correct or incorrect
- Contribute to a final score

Do not ask trivia questions such as:

> "What is the name of the new function?"

unless the name itself is conceptually important.

Prefer questions such as:

> "Why does the new implementation perform X before Y?"

or:

> "What happens when this input reaches component Z?"

Questions should cover different aspects of the change:

- System behavior
- Core intuition
- Data flow
- Implementation decisions
- Edge cases or trade-offs

At the end, display:

- Score
- Number correct
- Number incorrect
- A short interpretation of the result

For example:

- 5/5: You understand the change very well.
- 3–4/5: You understand the main idea; review the detailed walkthrough.
- 0–2/5: Revisit the background and intuition sections.

The quiz should be useful as a comprehension check, not a memory test.

## 14. Writing Style

Write with the clarity and flow of excellent technical teaching.

Use a style inspired by the strengths of Martin Kleppmann's technical writing:

- Start from concepts
- Build mental models
- Use concrete examples
- Explain causality
- Introduce complexity gradually
- Make transitions explicit
- Prefer precise language over jargon
- Explain jargon when it first appears
- Distinguish essential ideas from implementation details
- Connect implementation decisions to system behavior

Do not imitate distinctive wording or reproduce passages from his writing.

The tone should feel like an excellent engineer explaining a difficult system to another engineer.

Avoid:

- Generic filler
- Excessive repetition
- Marketing language
- Unnecessary praise
- "This is a very elegant solution" without explaining why
- Restating the diff without adding understanding
- Overly dramatic language
- Excessive use of "simply"
- Assuming the reader already understands the architecture

## 15. Diagrams and Visual Explanations

Use diagrams whenever they materially improve understanding.

Prefer a small number of reusable diagram families.

### System Diagram

Show components and data flow.

Example concepts: Browser, API, Service, Database, Queue, Worker.

### Sequence / Interaction Diagram

Show how components interact over time.

Represent: Actor, Request, Response, Event, Callback, Retry.

### State Diagram

Show transitions between states.

Useful for:

- State machines
- Lifecycle changes
- Async operations
- Job processing
- UI states

### Data Transformation Diagram

Show how data changes as it passes through the system.

Example (conceptual only — the actual HTML must implement this using HTML/CSS):

```
Raw input
   ↓
Validated input
   ↓
Normalized object
   ↓
Persisted record
   ↓
API response
```

### UI Mockup

When the change affects a user interface, create a simplified representation of what the user sees.

The mockup does not need to reproduce the exact production UI.

Its purpose is to explain:

- What changed
- What the user can now do
- What information appears
- How state changes visually

### Before / After Diagram

Show how the architecture or flow differs after the change.

## 16. Diagram Rules

All diagrams must be implemented using HTML/CSS.

**Never use ASCII diagrams in the final document.**

Do not use images when a simple HTML/CSS diagram can explain the concept more clearly.

Do not create decorative diagrams merely to fill space.

Every diagram should answer a specific question.

Prefer:

- Cards
- Nodes
- Arrows
- Labels
- Badges
- Tables
- Flow containers
- State indicators
- Simple SVG when appropriate

If SVG is used, it must be embedded directly in the HTML.

No external image assets should be required.

## 17. HTML Requirements

Produce one complete, self-contained HTML file.

The file must contain:

- HTML
- CSS
- JavaScript

Do not require:

- External CSS
- External JavaScript
- CDN resources
- External fonts
- Remote images
- Network access

The document must work when opened directly from the filesystem.

## 18. Page Structure

Use one long page.

Do not use tabs as the primary navigation structure.

Include:

- Title/header
- Short summary
- Table of contents
- Section headings
- Smooth navigation between sections
- Responsive layout
- Readable typography
- Code blocks
- Diagrams
- Callouts
- Interactive quiz

A sticky or compact table of contents is encouraged if it improves navigation.

Use semantic HTML where practical:

`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`

Use appropriate heading hierarchy.

There should be one primary `<h1>`.

## 19. Visual Design

Aim for a polished technical-documentation aesthetic.

Use:

- Clear hierarchy
- Generous spacing
- Readable line lengths
- Subtle borders
- Cards where useful
- Distinct code blocks
- Responsive layouts
- Accessible contrast
- Mobile-friendly sizing
- Consistent spacing
- Clear visual distinction between explanation and examples

Avoid:

- Excessive gradients
- Excessive animation
- Decorative UI that competes with the content
- Tiny text
- Huge headings that waste vertical space
- Dashboard-style layouts unless appropriate
- Excessive rounded cards
- Visual noise

The document should feel like a carefully designed engineering article, not a generic dashboard.

## 20. Callouts

Use visually distinct callouts for important information.

Useful categories include:

- Key idea
- Important
- Why this matters
- Edge case
- Trade-off
- Watch out
- Mental model
- Implementation detail
- Evidence

Callouts should contain substantive information.

Do not use callouts for generic encouragement or filler.

## 21. Code Blocks

Always use `<pre>` elements for code blocks.

For example:

```html
<pre><code>const result = await fetchData();</code></pre>
```

Do not use ordinary `<div>` elements for multiline code unless they explicitly contain `white-space: pre-wrap;`.

Before saving the HTML file:

1. Scan every code block in the generated HTML.
2. Confirm that its CSS preserves whitespace using either `white-space: pre` or `white-space: pre-wrap`.
3. Confirm that indentation and newlines are preserved.
4. Confirm that HTML-sensitive characters inside code examples are escaped correctly.
5. Confirm that code does not accidentally execute as HTML.

## 22. Syntax Highlighting

Do not require an external syntax-highlighting library.

If syntax highlighting is useful, implement a lightweight embedded approach using CSS classes or minimal JavaScript.

Do not spend excessive effort reproducing a full IDE.

Readability is more important than elaborate highlighting.

## 23. Interactivity

Use JavaScript for lightweight interactions that improve comprehension.

At minimum, the quiz must be interactive.

Other useful interactions include:

- Expandable explanations
- Before/after toggles
- Diagram highlighting
- Show/hide detailed explanations
- "Beginner background" collapsible sections
- Code explanation toggles
- State transition demonstrations

Do not add interaction merely for decoration.

The page must remain understandable without JavaScript except for interactive quiz functionality.

## 24. Accessibility

The generated document should be reasonably accessible.

Use:

- Semantic HTML
- Proper heading hierarchy
- Buttons for interactive controls
- Visible focus states
- Sufficient contrast
- Descriptive labels
- Keyboard-accessible quiz controls
- Avoid color as the only way to communicate meaning

Do not rely solely on hover interactions.

## 25. Responsive Design

The document should work well on:

- Desktop
- Laptop
- Tablet
- Phone

On small screens:

- Navigation should remain usable
- Code blocks should scroll horizontally rather than break the page
- Diagrams should adapt or scroll gracefully
- Tables should remain readable
- Quiz controls should be easy to tap
- Text should remain comfortably readable

Use CSS media queries.

## 26. Output File

Save the final document outside the repository so it does not become part of the project.

The filename must always begin with today's date:

`YYYY-MM-DD-`

Use a descriptive slug after the date.

Example:

`/tmp/2026-08-14-explanation-cache-invalidation.html`

The date must be the actual current date when the skill runs.

Do not hard-code the example date.

Use the current system date (e.g. run `date +%F`).

## 27. File Location

The generated file must:

- Exist outside the repository
- Not modify project source files
- Not be committed to git
- Be directly openable in a browser
- Contain everything needed to render the document

Prefer a temporary/global location such as:

`/tmp/YYYY-MM-DD-explanation-<slug>.html`

unless the user explicitly requests another location.

## 28. Validation Before Completion

Before finishing, verify the generated file.

Perform all of the following checks.

### File checks

- [ ] File exists.
- [ ] File is outside the repository.
- [ ] Filename begins with today's date.
- [ ] File extension is `.html`.
- [ ] File contains a complete HTML document.
- [ ] CSS is embedded.
- [ ] JavaScript is embedded.
- [ ] No required external resources exist.

### Content checks

- [ ] Overview exists.
- [ ] Background exists.
- [ ] Problem exists.
- [ ] Intuition exists.
- [ ] Before/After explanation exists.
- [ ] Code walkthrough exists.
- [ ] Detailed walkthrough exists when appropriate.
- [ ] Edge cases/trade-offs are addressed.
- [ ] Testing is addressed.
- [ ] Five quiz questions exist.

### Code checks

- [ ] Code excerpts are accurate.
- [ ] Code excerpts are relevant.
- [ ] No unnecessary full-file dumps.
- [ ] HTML-sensitive characters are escaped.
- [ ] Code blocks preserve whitespace.
- [ ] No code block accidentally executes.

### Diagram checks

- [ ] No ASCII diagrams appear in the final document.
- [ ] Diagrams use HTML/CSS/SVG.
- [ ] Diagrams contain meaningful labels.
- [ ] Diagrams explain actual behavior.
- [ ] Example data is included where useful.

### Quiz checks

- [ ] Exactly five questions.
- [ ] Each has one correct answer.
- [ ] Questions test understanding rather than trivia.
- [ ] Answers are interactive.
- [ ] Immediate feedback is shown.
- [ ] Explanations are provided.
- [ ] Final score is calculated.
- [ ] Quiz works on mobile.

### Design checks

- [ ] Responsive layout.
- [ ] Readable typography.
- [ ] Accessible contrast.
- [ ] Clear heading hierarchy.
- [ ] Table of contents works.
- [ ] No unnecessary animation.
- [ ] No excessive visual clutter.

## 29. Final Quality Standard

The final artifact should feel like a small interactive technical chapter about the code change, rather than a prettier version of a git diff.

A strong explanation should allow someone who did not author the change to:

- Understand the relevant architecture
- Understand the original problem
- Explain the core idea in their own words
- Follow the data through the system
- Understand the important code changes
- Recognize important edge cases
- Explain the trade-offs
- Understand how the change is tested
- Successfully answer the quiz

The document should optimize for durable understanding rather than exhaustive coverage of every changed line.

If a detail does not improve understanding, omit it.

If a concept is difficult, slow down and explain it with a concrete example or diagram.

If the implementation is straightforward, do not artificially make it sound complicated.

If the repository does not provide enough evidence to confidently explain something, explicitly identify the uncertainty rather than inventing an explanation.

## 30. Final Response

After generating and validating the HTML file, provide a concise response containing:

1. Confirmation that the explanation was generated.
2. The exact file path.
3. A one-sentence summary of what the explanation covers.

Do not paste the entire HTML document into the chat.

The generated HTML file is the primary deliverable.
