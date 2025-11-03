(function initAssistantButton(){
  if (window.__gcaButtonInjected) return;
  window.__gcaButtonInjected = true;

  console.log("GCA assistant button loaded");
  
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  
  const colorsLink = document.createElement('link');
  colorsLink.rel = 'stylesheet';
  colorsLink.href = chrome.runtime.getURL('content/colors.css');
  shadow.appendChild(colorsLink);
  
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('content/assistantActionButton.css');
  shadow.appendChild(styleLink);
  
  const rootContainer = document.createElement('div');
  rootContainer.className = 'gca-root';
  shadow.appendChild(rootContainer);

  const floatingActionButton = document.createElement('button');
  floatingActionButton.className = 'gca-fab';
  floatingActionButton.textContent = '＋';
  floatingActionButton.title = 'Open Assistant';
  floatingActionButton.setAttribute('aria-label', 'Open Assistant');
  floatingActionButton.setAttribute('aria-pressed', 'false');
  rootContainer.appendChild(floatingActionButton);

  let isOpen = false;

  function emit(type) {
    const eventDetail = { detail: { source: 'assistant-button' } };
    const messageType = `GCA_${type.replace(':', '_').toUpperCase()}`;
    const messageData = { type: messageType, source: 'assistant-button' };
    window.dispatchEvent(new CustomEvent(type, eventDetail));
    window.postMessage(messageData, '*');
  }
  function setOpen(value) {
    if (isOpen === value) return;
    isOpen = value;
    floatingActionButton.setAttribute('aria-pressed', String(isOpen));
    floatingActionButton.title = isOpen ? 'Close chat panel' : 'Open chat panel';
    emit(isOpen ? 'GCA:open' : 'GCA:close');
  }
  
  function toggle() {
    emit('GCA:toggle'); 
    setOpen(!isOpen);
    window.dispatchEvent(new CustomEvent('GCA:button-click'));
    window.postMessage({ type: 'GCA_BUTTON_CLICK' }, '*');
  }

  floatingActionButton.addEventListener('click', toggle);
})();