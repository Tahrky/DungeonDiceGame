# Development guidelines

## Code quality

- Write concise, readable and maintainable code.
- Prefer simple solutions over complex abstractions.
- Avoid unnecessary code duplication.
- Follow SOLID principles when relevant.
- Use existing project patterns and conventions.
- Remove unused variables, imports and functions.
- Avoid unnecessary comments and documentation.
- Prefer functional components.
- Keep components small and reusable.
- Avoid unnecessary useEffect hooks.
- Prefer existing hooks and utilities.
- Use TypeScript strict typing.
- Avoid unnecessary state.
- Keep JSX concise and readable.
- Always correct SonarQube issues and warnings.
- Try to stay under 300 lines of code per file.
- Strictly no more than 550 lines of code per file.

## Context management

- Read only files relevant to the current task.
- Do not scan the entire repository unnecessarily.
- Prefer targeted searches over broad searches.
- Do not read generated files, dependencies or build outputs.
- Reuse existing functions and components.
- Ask before introducing new dependencies.

## Implementation

- Modify only the files required for the task.
- Avoid rewriting entire files when a small change is sufficient.
- Preserve existing behavior unless explicitly requested.
- Do not generate unnecessary boilerplate.

## Responses

- Keep explanations concise.
- Summarize only the files modified.
- Avoid reproducing entire files in responses.
- Explain important architectural decisions.
