import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import BinderView from './components/BinderView.jsx';
import ShopView from './components/public/ShopView.jsx';
import StaffDocs from './components/docs/StaffDocs.jsx';
import { UIProvider } from './context/UIContext.jsx';
import StagingBanner from './components/StagingBanner.jsx';
import { IS_STAGING } from './lib/appEnv.js';
import './styles/index.css';

// A binder QR code links to ?binder=<location>, the public stock page is
// ?shop=1, and the staff docs page
// (footer link, or bookmarked/printed directly) links to ?help=1 — that's
// the entire "routing" this app needs, so a router library would be
// overkill. Both are intentionally separate render trees from the
// authenticated app: no session check, no UIProvider (no confirm/toast/
// lightbox needed for a read-only page), nothing shared with the logged-in
// experience. Staff docs deliberately needs no login — it should be
// reachable on a phone before ever signing in, or bookmarked/printed.
const params = new URLSearchParams(window.location.search);
const binderParam = params.get('binder');
const helpParam = params.get('help');
const shopParam = params.get('shop');

if (IS_STAGING) document.title = `STAGING · ${document.title}`;

const root = ReactDOM.createRoot(document.getElementById('root'));

if (binderParam) {
  root.render(
    <React.StrictMode>
      <StagingBanner />
      <BinderView location={binderParam} />
    </React.StrictMode>
  );
} else if (shopParam) {
  root.render(
    <React.StrictMode>
      <StagingBanner />
      <ShopView />
    </React.StrictMode>
  );
} else if (helpParam) {
  root.render(
    <React.StrictMode>
      <StagingBanner />
      <StaffDocs />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <StagingBanner />
      <UIProvider>
        <App />
      </UIProvider>
    </React.StrictMode>
  );
}
