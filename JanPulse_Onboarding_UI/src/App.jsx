import React from 'react';
import OnboardingWizard from './components/OnboardingWizard';
import './index.css';

function App() {
  return (
    <>
      <div className="mesh-bg">
        <div className="mesh-blob blob-1"></div>
        <div className="mesh-blob blob-2"></div>
        <div className="mesh-blob blob-3"></div>
      </div>
      
      <div className="app-container">
        <div className="wizard-container">
          <OnboardingWizard />
        </div>
      </div>
    </>
  );
}

export default App;
