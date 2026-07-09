import React from 'react';
import { motion } from 'framer-motion';

export default function ShapeGrid() {
  const rows = 12;
  const cols = 20;
  
  // Create an array of random indices that will feature special floating shapes
  const specialIndices = new Set();
  for(let i=0; i<30; i++) specialIndices.add(Math.floor(Math.random() * (rows * cols)));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 0, // Sits above the mesh but behind the glass UI
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      pointerEvents: 'none',
      opacity: 0.25
    }}>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const isSpecial = specialIndices.has(i);
        
        return (
          <div
            key={i}
            style={{
              borderRight: '1px solid rgba(255,255,255,0.1)',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* Pulsing Grid Intersections */}
            <motion.div 
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 3,
                height: 3,
                backgroundColor: '#a1a1aa',
                borderRadius: '50%'
              }}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: Math.random() * 3 + 2, repeat: Infinity }}
            />
            
            {/* Animated Shapes in random grid cells */}
            {isSpecial && (
              <motion.div
                style={{
                  width: '40%',
                  height: '40%',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  borderRadius: i % 2 === 0 ? '50%' : '2px'
                }}
                animate={{
                  rotate: [0, 90, 180, 270, 360],
                  scale: [0.8, 1.2, 0.8],
                  opacity: [0, 0.8, 0]
                }}
                transition={{
                  duration: Math.random() * 10 + 5,
                  repeat: Infinity,
                  ease: "linear",
                  delay: Math.random() * 5
                }}
              />
            )}
          </div>
        );
      })}
      
      {/* Radial vignette mask to fade edges into darkness */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        background: 'radial-gradient(circle at 50% 50%, transparent 20%, #050505 100%)' 
      }} />
    </div>
  );
}
