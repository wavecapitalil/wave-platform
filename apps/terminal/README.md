# WAVE Terminal

apps/terminal/public contains the deployable stabilization baseline copied from the current v1 Terminal.

The immutable original snapshot lives under legacy/terminal-v1.

## Stabilization rule

Do not begin the React/Next component migration until:
- security blockers are closed;
- broken API routes are reconciled;
- smoke tests exist;
- the current baseline is reproducible.
