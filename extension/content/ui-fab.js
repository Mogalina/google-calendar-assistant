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
  fab.title = 'Open Assistant';
  fab.setAttribute('aria-label', 'Open Assistant');

  root.appendChild(fab);

  
  fab.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('GCA:fab-click'));
    window.postMessage({ type: 'GCA_FAB_CLICK' }, '*');
  });
})();
