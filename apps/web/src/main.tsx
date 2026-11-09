import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import AppErrorBoundary from './AppErrorBoundary';
const container=document.getElementById('root')!;
const application=<React.StrictMode><AppErrorBoundary><BrowserRouter><App/></BrowserRouter></AppErrorBoundary></React.StrictMode>;
if(window.location.pathname==='/'&&container.hasChildNodes())hydrateRoot(container,application);
else{
 // SPA fallback HTML contains only the public homepage, never a protected user's state.
 // Other routes intentionally render their own shell instead of hydrating mismatched public HTML.
 container.replaceChildren();
 createRoot(container).render(application);
}
