# Credential hygiene and rotation

The repository is public. Treat any credential-like value that has ever been committed as disclosed, even after it is removed from the current branch.

## Current runtime model

- `MAPS_BROWSER_KEY` is stored in server configuration and injected into rendered browser pages by `template-runtime.php`.
- `PLACES_API_KEY` and `ANTHROPIC_API_KEY` remain server-side only.
- Authentication uses random server-side session tokens. The old fixed browser bearer-token model is retired.
- Shared HTML source contains non-secret placeholders rather than active credentials.

## Google Maps browser key

A Maps browser key is visible to visitors by design, but it should not be hard-coded into Git. Restrict it in Google Cloud so that disclosure does not make it generally usable.

After a key has appeared in repository history:

1. Create/rotate to a replacement browser Maps key in Google Cloud.
2. Restrict HTTP referrers to the production site, including the canonical `https://joelpagett.co.uk/*` host and any intentionally supported `www` host.
3. Restrict the key to only the Google APIs the browser actually requires, primarily Maps JavaScript and any explicitly used browser-side Maps services.
4. Put the replacement value in production `MAPS_BROWSER_KEY` server configuration, never in Git.
5. Deploy and verify the itinerary map, trips/parks maps, and mobile browser rendering.
6. Disable/delete the previously committed browser key after the replacement is confirmed.

## Retired fixed auth token

The historical fixed browser bearer token must never be reused. Current authentication is independent of it and uses random database-backed sessions.

If an old hosting configuration, template copy, deployment artifact, or automation still contains that retired fixed token, remove it. Do not restore it from repository history or an old backup.

## Repository enforcement

`scripts/validate-source-hygiene.py` fails CI when tracked source contains common credential-shaped literals, including Google API keys, Anthropic API keys, AWS access keys, and the retired fixed 64-character `AUTH_TOKEN` form.

This is a prevention layer, not a substitute for provider-side key restrictions, rotation, or GitHub secret scanning.
