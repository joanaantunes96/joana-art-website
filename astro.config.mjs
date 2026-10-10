import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://joana-art-website.vercel.app',
  adapter: vercel(),
});
