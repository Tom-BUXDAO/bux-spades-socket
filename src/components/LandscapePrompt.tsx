"use client";

import { useState, useEffect } from 'react';
import { IoArrowRedo } from 'react-icons/io5';

export default function LandscapePrompt() {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== 'undefined') {
        setIsPortrait(window.innerHeight > window.innerWidth);
      }
    };

    // Initial check
    checkOrientation();

    // Add listener for resize/orientation change
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    // Clean up
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-6">Please Rotate Your Device</h2>
        <p className="text-white mb-8">This game is best experienced in landscape mode.</p>
        
        {/* Spinning arrow animation */}
        <div className="animate-spin mb-6 mx-auto text-yellow-400">
          <IoArrowRedo className="transform rotate-90" size={80} />
        </div>
        
        <p className="text-gray-300 text-sm">Rotate your device to continue playing!</p>
      </div>
    </div>
  );
} 