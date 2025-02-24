'use client'

import { useState, useRef, useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import MasterVisualizer from './components/MasterVisualizer';

export default function Home() {
  const [globalBPM, setGlobalBPM] = useState<number>(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0); // 0-3 for four beats
  const [soloChannels, setSoloChannels] = useState<Set<number>>(new Set());
  const [masterVolume, setMasterVolume] = useState(1);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const beatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [masterAnalyser, setMasterAnalyser] = useState<AnalyserNode | null>(null);
  const [totalFileSize, setTotalFileSize] = useState<number>(0);
  const [totalBufferSize, setTotalBufferSize] = useState<number>(0);

  // Initialize audio context and master gain
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const gainNode = ctx.createGain();
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    
    gainNode.connect(analyserNode);
    analyserNode.connect(ctx.destination);
    
    setAudioContext(ctx);
    setMasterAnalyser(analyserNode);
    masterGainRef.current = gainNode;

    return () => {
      ctx.close();
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      const interval = (60 / globalBPM) * 1000; // Convert BPM to milliseconds
      beatIntervalRef.current = setInterval(() => {
        setCurrentBeat(prev => (prev + 1) % 4);
      }, interval);
    } else {
      if (beatIntervalRef.current) {
        clearInterval(beatIntervalRef.current);
        beatIntervalRef.current = null;
      }
      setCurrentBeat(0);
    }

    return () => {
      if (beatIntervalRef.current) {
        clearInterval(beatIntervalRef.current);
      }
    };
  }, [isPlaying, globalBPM]);

  const handleBPMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const newBPM = parseInt(value);
    
    // Allow empty input for typing
    if (value === '') {
      setGlobalBPM(0);
      return;
    }
    
    // Only update if it's a valid number
    if (!isNaN(newBPM)) {
      // Clamp value between 60-200 when input is complete
      if (value.length >= 3) {
        const clampedBPM = Math.min(Math.max(newBPM, 60), 200);
        setGlobalBPM(clampedBPM);
      } else {
        setGlobalBPM(newBPM);
      }
    }
  };

  const handleGlobalPlayback = () => {
    // Resume AudioContext on first play
    if (audioContext?.state === 'suspended') {
      audioContext.resume();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSolo = (channelNumber: number) => {
    setSoloChannels(prev => {
      const newSolo = new Set(prev);
      if (newSolo.has(channelNumber)) {
        newSolo.delete(channelNumber);
      } else {
        newSolo.add(channelNumber);
      }
      return newSolo;
    });
  };

  // Determine if a channel should be heard
  const isChannelActive = (channelNumber: number) => {
    return soloChannels.size === 0 || soloChannels.has(channelNumber);
  };

  const handleMasterVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setMasterVolume(newVolume);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = newVolume;
    }
  };

  // Add this function to calculate memory
  const updateTotalMemory = (fileSize: number | null, bufferSize: number | null, isAdding: boolean) => {
    setTotalFileSize(prev => isAdding ? prev + (fileSize || 0) : prev - (fileSize || 0));
    setTotalBufferSize(prev => isAdding ? prev + (bufferSize || 0) : prev - (bufferSize || 0));
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <div className="w-full max-w-[1800px]">
        {/* Global Controls */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <label className="font-medium text-gray-700">Global Tempo:</label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={globalBPM || ''}
                  onChange={handleBPMChange}
                  className="w-20 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500">BPM</span>
              </div>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((beat) => (
                  <div 
                    key={beat}
                    className={`w-3 h-3 rounded-full transition-colors duration-75 ${
                      currentBeat === beat ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-4">
                <label className="font-medium text-gray-700">Master:</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={masterVolume}
                  onChange={handleMasterVolumeChange}
                  className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-gray-500 w-12 text-right">
                  {Math.round(masterVolume * 100)}%
                </span>
              </div>
              <button
                onClick={handleGlobalPlayback}
                className={`px-6 py-2 rounded font-medium transition-colors mr-8 ${
                  isPlaying 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {isPlaying ? 'Stop' : 'Play'}
              </button>
            </div>
            <div className="text-sm text-gray-600 text-right">
              <div>Files: {(totalFileSize / (1024 * 1024)).toFixed(2)} MB</div>
              <div>Memory: {(totalBufferSize / (1024 * 1024)).toFixed(2)} MB</div>
            </div>
          </div>
        </div>

        {/* Master Visualizer */}
        <MasterVisualizer analyser={masterAnalyser} />

        {/* Eight Channels */}
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(channelNumber => (
            <AudioPlayer
              key={channelNumber}
              title={channelNumber.toString()}
              globalBPM={globalBPM}
              isGlobalPlaying={isPlaying}
              isSolo={soloChannels.has(channelNumber)}
              isActive={isChannelActive(channelNumber)}
              onSolo={() => handleSolo(channelNumber)}
              masterGainNode={masterGainRef.current}
              audioContext={audioContext}
              onMemoryChange={updateTotalMemory}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
