<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Rules

- Keep service secrets server-only. Never expose `APIFY_TOKEN`, `OPENAI_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` to client components.
- Browser code may call only our own app routes or server actions. It must not call Apify or OpenAI directly.
- Put provider-specific import logic under `src/server/import-providers/**`.
- Put shared API contracts under `src/contracts/**` so A/B branches can integrate without guessing shapes.
- This app is the shared scaffold baseline for `feature/a-core-import` and `feature/b-admin-ui-rewrite`.
