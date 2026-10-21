import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single artifact goal: the production build emits one self-contained
// dist/index.html with all JS and CSS inlined (used from file://).
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'esnext',
  },
});
