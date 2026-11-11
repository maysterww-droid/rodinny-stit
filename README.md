# RODINNÝ ŠTÍT — public AI paused (11 November 2026)

**Current public state:** Paid live AI analysis is temporarily suspended by the owner. The static GitHub Pages website offers a free, local rule-based message checker.

## Public links

- [Public landing](https://maysterww-droid.github.io/rodinny-stit/)
- [Free offline-style local message check](https://maysterww-droid.github.io/rodinny-stit/pilot.html)

The local checker uses client-side rules and does **not** send messages to OpenAI or incur model charges. It is informational and does not verify the identity of senders.

## Important operations note

The Vercel source branch `feature/ai-first-2-1-quality-mobile` has a separate **server-side closed /api/analyze endpoint**, returning `GET {ai:false,mode:"local_only"}` and HTTP 503 on POST without calling OpenAI. **This does not switch off an existing production deployment until Vercel redeploys this code.** To guarantee immediate suspension on the already deployed Vercel endpoint, set `AI_ENABLED=false` in Vercel Production and redeploy, or revoke the dedicated OpenAI API key used by this project.

Project environment variables and secrets are not stored in the repository. Never commit a key.

The previously accepted live AI prototype and landing with future roadmap are preserved in backup branches:
- `backup/public-pages-before-ai-pause-20261111`
- `backup/vercel-ai-before-shutdown-20261111`

Reactivation requires the owner's explicit approval and renewed expense controls.
