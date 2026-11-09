import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import Landing from './Landing';
import PublicPage, { publicPages } from './PublicPages';

const ApplicationShell = lazy(() => import('./ApplicationShell'));

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing/>}/>
    {[...Object.keys(publicPages),'quote-request','contact','newsletter-preferences'].map(slug=><Route key={slug} path={'/'+slug} element={<PublicPage slug={slug}/>}/>)}
    <Route path="*" element={<Suspense fallback={<main className="center-state" role="status"><h1>Opening EcoGrowth…</h1><p>Loading the requested section. No service record is confirmed until the API responds.</p></main>}><ApplicationShell/></Suspense>}/>
  </Routes>;
}
