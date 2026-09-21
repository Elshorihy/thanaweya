# Thanaweya OS

Arabic-first study productivity app for Egyptian secondary students.

## Cloudflare

For Cloudflare Pages / Workers Builds, use:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

If using the command `npx wrangler deploy`, make sure the build runs first:

`npm install && npm run build && npx wrangler deploy`

The app is client-side and stores user data locally in the browser.

## No AI

This project intentionally contains no AI APIs, AI tutor, AI generation, or AI recommendations.


Build validation has been fixed and runs through GitHub Actions.
