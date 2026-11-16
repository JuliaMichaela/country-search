import { mountApp } from './ui/app.js';

const unmount = mountApp(document.body);

// A page entering the back/forward cache (persisted) is only frozen and can be restored by
// `pageshow` exactly as it was, so the app must stay mounted. Only a page that is really being
// unloaded is torn down, and the listener goes away with it.
function onPageHide(event: PageTransitionEvent): void {
  if (event.persisted) {
    return;
  }
  window.removeEventListener('pagehide', onPageHide);
  unmount();
}

window.addEventListener('pagehide', onPageHide);
