# Molam UI - Storybook Deployment

## GitHub Pages Setup

This document explains how to deploy the Molam UI Storybook to GitHub Pages.

### Automatic Deployment

The Storybook is automatically deployed to GitHub Pages when you push to the `main` branch.

The deployment workflow is defined in `.github/workflows/pages-deploy.yml`.

### Manual Deployment

You can also trigger a manual deployment:

1. Go to the "Actions" tab in your GitHub repository
2. Select the "Deploy Storybook to GitHub Pages" workflow
3. Click "Run workflow"

### Viewing Your Storybook

Once deployed, your Storybook will be available at:

```
https://<your-username>.github.io/<repository-name>/
```

For example:
```
https://molam-team.github.io/molam-ui/
```

### GitHub Pages Configuration

To enable GitHub Pages:

1. Go to your repository **Settings**
2. Navigate to **Pages** in the left sidebar
3. Under **Source**, select:
   - Source: **GitHub Actions**
4. Save the changes

### Custom Domain (Optional)

To use a custom domain:

1. In repository **Settings** > **Pages**
2. Enter your custom domain (e.g., `ui.molam.dev`)
3. Add a `CNAME` file to your repository root with your domain
4. Configure your DNS with a CNAME record pointing to `<username>.github.io`

### Troubleshooting

If the deployment fails:

1. Check the **Actions** tab for error messages
2. Ensure GitHub Pages is enabled in repository settings
3. Verify that the workflow has the correct permissions:
   - `contents: read`
   - `pages: write`
   - `id-token: write`

### Local Preview

To preview the production build locally:

```bash
npm run build-storybook
npx http-server ./storybook-static
```

Then open http://localhost:8080 in your browser.
