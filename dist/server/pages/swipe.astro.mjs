import { c as createComponent, r as renderHead, d as renderComponent, b as renderTemplate } from '../chunks/astro/server_B_mT1j0F.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Swipe = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="es"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#0d0d0d"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="description" content="Carga de stock por marca — Depósito"><title>Swipe — Depósito</title><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="manifest" href="/manifest.json">${renderHead()}</head> <body> ${renderComponent($$result, "SwipeProductos", null, { "client:only": "svelte", "client:component-hydration": "only", "client:component-path": "/home/matiasdiez/Web/trabajo/distrizen/app/src/components/SwipeProductos.svelte", "client:component-export": "default" })} </body></html>`;
}, "/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/swipe.astro", void 0);

const $$file = "/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/swipe.astro";
const $$url = "/swipe";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Swipe,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
