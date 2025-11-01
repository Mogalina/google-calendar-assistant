(function initFab(){
  if (window.__gcaFabInjected) return;
  window.__gcaFabInjected = true;

  console.log("GCA FAB loaded");

  
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/content.css');
  shadow.appendChild(link);

  
  const root = document.createElement('div');
  root.className = 'gca-root';
  shadow.appendChild(root);

  const fab = document.createElement('button');
  fab.className = 'gca-fab';
  fab.textContent = '＋';
  fab.title = 'Open panel';
  fab.setAttribute('aria-label', 'Open chat panel');
  fab.setAttribute('aria-pressed', 'false');

  root.appendChild(fab);

  let isOpen = false;

  function emit(type) {
    window.dispatchEvent(new CustomEvent(type, { detail: { source: 'fab' } }));
    window.postMessage({ type: `GCA_${type.replace(':','_').toUpperCase()}`, source: 'fab' }, '*');
  }

  function setOpen(v) {
    if (isOpen === v) return;
    isOpen = v;
    fab.setAttribute('aria-pressed', String(isOpen));
    fab.title = isOpen ? 'Close chat panel' : 'Open chat panel';
    emit(isOpen ? 'GCA:open' : 'GCA:close');
  }
  
  function toggle() {
    emit('GCA:toggle');   // panelul va asculta asta
    setOpen(!isOpen);
  }
  
  fab.addEventListener('click', toggle);

  
  
})();
