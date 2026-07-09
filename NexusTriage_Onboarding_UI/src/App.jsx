import React, { useState, useEffect } from 'react';
import OnboardingWizard from './components/OnboardingWizard';
import Dashboard from './components/Dashboard';
import AuroraBackground from './components/AuroraBackground';
import './index.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.onboarding_complete === 'true') setOnboarded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Connecting to NexusTriage...</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-layer">
        <AuroraBackground />
      </div>
      {onboarded ? (
        <Dashboard onReset={() => setOnboarded(false)} />
      ) : (
        <OnboardingWizard onComplete={() => setOnboarded(true)} />
      )}
    </>
  );
}

export default App;
