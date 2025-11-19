# Storybook / CI deploy notes

## Required GitHub secrets (if any)
- None required for `peaceiris/actions-gh-pages` — it uses GITHUB_TOKEN by default.
- If you prefer to publish to S3, set:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - AWS_REGION
  - S3_BUCKET

## Branching & Pages
- CI builds and publishes storybook to the `gh-pages` branch.
- Configure GitHub Pages in repo settings to serve from `gh-pages` branch / root.

## Local dev with Docker Compose
- `docker compose up --build dev` runs Vite and Storybook in one container (dev).
- `docker compose up --build storybook-prod` runs the production nginx preview on port 8080.

## Notes
- Ensure `npm run build-storybook` exists (already in `package.json`).
- For production Storybook CDN, consider uploading `storybook-static` to a CDN (S3+CloudFront), for which create a dedicated `publish-to-s3` GitHub Action.

