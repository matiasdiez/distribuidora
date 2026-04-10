import { c as createComponent, r as renderHead, a as renderScript, b as renderTemplate } from '../chunks/astro/server_B_mT1j0F.mjs';
export { renderers } from '../renderers.mjs';

const prerender = true;
const $$Stock = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="es"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#0d0d0d"><meta name="description" content="Consulta de stock del depósito"><meta name="robots" content="noindex"><!-- no indexar en buscadores --><title>Stock — Depósito</title><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="stylesheet" href="/styles/global.css">${renderHead()}</head> <body> <div id="stock-app"></div> ${renderScript($$result, "/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/stock.astro?astro&type=script&index=0&lang.ts")} </body> </html>`;
}, "/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/stock.astro", void 0);

const $$file = "/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/stock.astro";
const $$url = "/stock";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Stock,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
