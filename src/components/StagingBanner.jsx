import { IS_STAGING } from '../lib/appEnv.js';

// A strip across the top of every page of a staging build, so the test
// copy can never be mistaken for the live shop. Renders nothing in
// production.
export default function StagingBanner() {
  if (!IS_STAGING) return null;
  return (
    <div className="staging-banner" role="note">
      STAGING: a test copy of the shop&apos;s data. Changes here don&apos;t affect the live app.
    </div>
  );
}
