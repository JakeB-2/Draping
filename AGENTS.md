<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment workflow

Production deploys from `main`. When the user asks to push completed work, push
the tested commit to both `development` and `main` unless they explicitly ask
for a preview-only push. Keep both remote branches at the same commit and leave
the worktree clean.
