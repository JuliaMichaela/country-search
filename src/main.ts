import { mountApp } from './ui/app.js';

const unmount = mountApp(document.body);
window.addEventListener('pagehide', unmount, { once: true });
