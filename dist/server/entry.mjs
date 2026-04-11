import { renderers } from './renderers.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_7IzS5Lfv.mjs';
import { manifest } from './manifest_mFaROxZu.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/clasificar.astro.mjs');
const _page1 = () => import('./pages/settings.astro.mjs');
const _page2 = () => import('./pages/stock.astro.mjs');
const _page3 = () => import('./pages/swipe.astro.mjs');
const _page4 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["src/pages/clasificar.astro", _page0],
    ["src/pages/settings.astro", _page1],
    ["src/pages/stock.astro", _page2],
    ["src/pages/swipe.astro", _page3],
    ["src/pages/index.astro", _page4]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "mode": "standalone",
    "client": "file:///home/matiasdiez/Web/trabajo/distrizen/app/dist/client/",
    "server": "file:///home/matiasdiez/Web/trabajo/distrizen/app/dist/server/",
    "host": false,
    "port": 4321,
    "assets": "_astro",
    "experimentalStaticHeaders": false
};
const _exports = createExports(_manifest, _args);
const handler = _exports['handler'];
const startServer = _exports['startServer'];
const options = _exports['options'];
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) {
	serverEntrypointModule[_start](_manifest, _args);
}

export { handler, options, pageMap, startServer };
