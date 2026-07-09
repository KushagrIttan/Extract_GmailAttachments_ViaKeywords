import React from 'react';
import OnboardingWizard from './components/OnboardingWizard';
import Dither from './components/Dither';
import './index.css';

function App() {
  return (
    <>
      <div className="bg-layer">
        <Dither
          waveSpeed={0.02}
          waveFrequency={2}
          waveAmplitude={0.25}
          waveColor={[0.08, 0.04, 0.14]}
          colorNum={4}
          pixelSize={2}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.8}
        />
      </div>
      <OnboardingWizard />
    </>
  );
}

export default App;
