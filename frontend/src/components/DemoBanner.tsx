import './DemoBanner.css';
import { GITHUB_URL } from '../config';
import { resetDemo } from '../demo/store';

export function DemoBanner() {
  const reset = () => {
    resetDemo();
    location.reload();
  };
  return (
    <div className="demo-banner" role="note">
      <span className="demo-banner-text">
        <strong>Live demo</strong>
        <span className="demo-banner-sep"> · </span>
        The AI is simulated and your data stays in this browser.
      </span>
      <span className="demo-banner-actions">
        <button type="button" onClick={reset}>Reset demo</button>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Full-stack source ↗</a>
      </span>
    </div>
  );
}
