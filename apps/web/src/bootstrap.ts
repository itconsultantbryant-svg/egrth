import './styles.css';
import './public-interactions';

// The production homepage is React-rendered at build time and has only ordinary links.
// It needs no auth/session cache, React runtime, or hydration to be readable and navigable.
// Dev mode and all non-home routes still load the complete responsive React application.
const staticPublicHome = import.meta.env.PROD && window.location.pathname === '/'
  && Boolean(document.getElementById('root')?.hasChildNodes());

if (!staticPublicHome) {
  import('./main').catch(() => {
    const root = document.getElementById('root');
    if (!root) return;
    root.replaceChildren();
    const heading = document.createElement('h1');
    heading.textContent = 'EcoGrowth could not open this section';
    const message = document.createElement('p');
    message.textContent = 'Check your connection and reload authoritative records before retrying a submission.';
    const retry = document.createElement('a');
    retry.href = window.location.href;
    retry.textContent = 'Reload this section';
    root.append(heading, message, retry);
  });
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
