'use client'

import { useState, useRef, useEffect } from "react";
import { amplitudeToDB } from "../utils/audio";

interface AudioPlayerProps {
  title?: string;
  globalBPM: number;
  isGlobalPlaying: boolean;
  className?: string;
  isSolo: boolean;
  isActive: boolean;
  onSolo: () => void;
  masterGainNode: GainNode | null;
  audioContext: AudioContext | null;
}

function extractBPMFromFilename(filename: string): number | null {
  console.log("Checking filename:", filename);

  // Try a simpler approach first - look for "Bpm" followed by numbers
  const simpleBpmMatch = filename.match(/Bpm(\d+)/);
  console.log("Simple BPM match:", simpleBpmMatch);
  
  if (simpleBpmMatch) {
    const bpm = parseInt(simpleBpmMatch[1]);
    console.log("Found BPM:", bpm);
    if (bpm >= 60 && bpm <= 200) {
      return bpm;
    }
  }

  // If simple approach fails, try other patterns
  const bpmPatterns = [
    /\D(\d{2,3})bpm/i,
    /\D(\d{2,3})_bpm/i,
    /[\(\[\s](\d{2,3})[\)\]\s]/,
    /bpm(\d{2,3})/i,
  ];

  for (const pattern of bpmPatterns) {
    console.log("Trying pattern:", pattern);
    const match = filename.match(pattern);
    console.log("Match result:", match);
    
    if (match) {
      const bpm = parseInt(match[1]);
      console.log("Found BPM:", bpm);
      if (bpm >= 60 && bpm <= 200) {
        return bpm;
      }
    }
  }
  
  console.log("No BPM found in filename");
  return null;
}

async function detectBPM(audioBuffer: AudioBuffer, filename: string): Promise<number> {
  const filenameBPM = extractBPMFromFilename(filename);
  
  if (filenameBPM) {
    console.log('Found BPM in filename:', filenameBPM);
    
    const samplesPerBeat = (audioBuffer.sampleRate * 60) / filenameBPM;
    console.log('Samples per beat:', samplesPerBeat);
    
    const data = audioBuffer.getChannelData(0);
    const numBeats = Math.floor(data.length / samplesPerBeat);
    console.log('Expected number of beats:', numBeats);
    
    let confirmedBeats = 0;
    const windowSize = Math.floor(samplesPerBeat * 0.2); // Increased from 0.1 to 0.2
    
    for (let i = 0; i < numBeats; i++) {
      const expectedBeatPos = Math.floor(i * samplesPerBeat);
      let beatEnergy = 0;
      let surroundingEnergy = 0;
      
      // Calculate energy at expected beat position with wider window
      for (let j = -windowSize; j < windowSize; j++) {
        const pos = expectedBeatPos + j;
        if (pos >= 0 && pos < data.length) {
          const value = Math.abs(data[pos]);
          if (Math.abs(j) < windowSize * 0.2) { // Consider central 20% as beat position
            beatEnergy += value;
          } else {
            surroundingEnergy += value;
          }
        }
      }
      
      // More lenient comparison
      if (beatEnergy * 1.5 > surroundingEnergy / (windowSize * 2)) { // Adjusted ratio
        confirmedBeats++;
      }
    }
    
    console.log('Confirmed beats:', confirmedBeats);
    console.log('Beat confirmation rate:', (confirmedBeats / numBeats) * 100);
    
    // Lower threshold to 20%
    if (confirmedBeats > numBeats * 0.2) {
      console.log('Using filename BPM based on beat confirmation');
      return filenameBPM;
    }
    
    console.log('Insufficient beat confirmation, falling back to detection');
  }
  
  // Fall back to original detection method if filename BPM isn't confirmed
  // ... rest of the existing detection code ...

  // If filename BPM isn't confirmed, use the original detection method
  const expectedInterval = filenameBPM ? 60 / filenameBPM : null; // Convert BPM to seconds between beats
  
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Create offline context for the full duration
  const offlineContext = new OfflineAudioContext(1, data.length, sampleRate);
  
  // Create and connect nodes
  const source = offlineContext.createBufferSource();
  const analyser = offlineContext.createAnalyser();
  const filter = offlineContext.createBiquadFilter();
  
  // Configure filter to focus more narrowly on kick drum frequencies
  filter.type = 'bandpass';
  filter.frequency.value = 50; // Adjust to focus more on kick
  filter.Q.value = 8.0; // Increase Q for narrower band
  
  // Add a second filter for even more focused detection
  const filter2 = offlineContext.createBiquadFilter();
  filter2.type = 'lowpass';
  filter2.frequency.value = 150;
  filter2.Q.value = 1;
  
  // Configure analyser
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  
  // Connect nodes with both filters
  source.buffer = audioBuffer;
  source.connect(filter);
  filter.connect(filter2);
  filter2.connect(analyser);
  analyser.connect(offlineContext.destination);
  
  // Start the source
  source.start(0);
  
  // Render the audio
  const renderedBuffer = await offlineContext.startRendering();
  const channelData = renderedBuffer.getChannelData(0);
  
  // Process in smaller chunks (around 10ms)
  const chunkSize = Math.floor(sampleRate * 0.01);
  const chunks = Math.floor(channelData.length / chunkSize);
  const energies: number[] = [];
  
  // Calculate energy of each chunk
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    const chunk = channelData.slice(start, end);
    
    // Calculate RMS energy
    const energy = Math.sqrt(chunk.reduce((acc, val) => acc + (val * val), 0) / chunk.length);
    energies.push(energy);
  }
  
  // Adjust energy calculation to be more sensitive
  const energyThreshold = 0.005; // Lower threshold for peak detection
  
  // Find local maxima (peaks)
  const peaks: number[] = [];
  const lookAhead = 10; // Increase look-ahead window
  
  for (let i = lookAhead; i < energies.length - lookAhead; i++) {
    const window = energies.slice(i - lookAhead, i + lookAhead + 1);
    const max = Math.max(...window);
    
    if (energies[i] === max && energies[i] > energyThreshold) {
      // Only add peak if it's significantly higher than surrounding values
      const avgEnergy = window.reduce((sum, val) => sum + val, 0) / window.length;
      if (energies[i] > avgEnergy * 1.5) { // Peak must be 50% higher than average
        peaks.push(i);
      }
    }
  }
  
  // After we've found our peaks, validate against the expected interval
  if (peaks.length < 2) return 120;
  
  // Calculate intervals between peaks
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push((peaks[i] - peaks[i - 1]) * 0.01); // Convert to seconds
  }
  
  // If we have an expected interval from filename
  if (expectedInterval) {
    // Group intervals by how well they match the expected interval
    const tolerance = 0.2; // Increase tolerance
    const matchingIntervals: number[] = [];
    const otherIntervals: number[] = [];
    
    intervals.forEach(interval => {
      const ratios = [0.25, 0.5, 1, 2, 4];
      let matches = false;
      let matchedRatio = null;
      
      ratios.forEach(ratio => {
        const target = expectedInterval * ratio;
        if (Math.abs(interval - target) <= target * tolerance) {
          matches = true;
          matchedRatio = ratio;
        }
      });
      
      if (matches) {
        matchingIntervals.push(interval);
      } else {
        otherIntervals.push(interval);
      }
    });
    
    console.log('Expected interval:', expectedInterval);
    console.log('Matching intervals:', matchingIntervals.length);
    console.log('Total intervals:', intervals.length);
    console.log('Match percentage:', (matchingIntervals.length / intervals.length) * 100);
    
    // Lower threshold even more for files with lots of high frequency content
    if (matchingIntervals.length > intervals.length * 0.1 && filenameBPM) {
      console.log('Using filename BPM:', filenameBPM);
      return filenameBPM;
    }
  }
  
  // Fallback to original detection method
  const intervalGroups = new Map<number, number>();
  intervals.forEach(interval => {
    const roundedInterval = Math.round(interval * 20) / 20;
    intervalGroups.set(roundedInterval, (intervalGroups.get(roundedInterval) || 0) + 1);
  });
  
  let maxCount = 0;
  let mostCommonInterval = 0.5;
  intervalGroups.forEach((count, interval) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonInterval = interval;
    }
  });
  
  const bpm = Math.round(60 / mostCommonInterval);
  
  if (bpm >= 60 && bpm <= 200) {
    return bpm;
  }
  
  return 120;
}

export default function AudioPlayer({ 
  title = "Audio Player",
  globalBPM,
  isGlobalPlaying,
  className = "",
  isSolo,
  isActive,
  onSolo,
  masterGainNode,
  audioContext
}: AudioPlayerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [manualBPM, setManualBPM] = useState<string>('');
  const [peak, setPeak] = useState<number>(0);
  const [displayPeak, setDisplayPeak] = useState<number>(0);
  const lastUpdateRef = useRef<number>(0);

  // Audio refs
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  
  // Visual refs
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (audioContext && !analyserRef.current) {
      analyserRef.current = audioContext.createAnalyser();
      gainNodeRef.current = audioContext.createGain();
      analyserRef.current.fftSize = 2048;

      if (gainNodeRef.current && masterGainNode) {
        gainNodeRef.current.connect(masterGainNode);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioContext, masterGainNode]);

  // Update playback rate when globalBPM changes
  useEffect(() => {
    if (bpm) {
      const newRate = globalBPM / bpm;
      setPlaybackRate(newRate);
      
      // Update playback rate of current source if playing
      if (sourceNodeRef.current) {
        sourceNodeRef.current.playbackRate.setValueAtTime(newRate, audioContext?.currentTime || 0);
      }
    }
  }, [globalBPM, bpm]);

  // Handle global playback state changes
  useEffect(() => {
    if (isGlobalPlaying && audioBufferRef.current && isActive) {
      startPlayback();
    } else {
      stopPlayback();
    }
  }, [isGlobalPlaying, isActive]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(file => file.type.startsWith('audio/'));
    
    if (audioFile) {
      setAudioFile(audioFile);
      
      try {
        const arrayBuffer = await audioFile.arrayBuffer();
        
        if (audioContext) {
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          audioBufferRef.current = audioBuffer;
          
          const detectedBpm = await detectBPM(audioBuffer, audioFile.name);
          setBpm(detectedBpm);
          
          setDuration(audioBuffer.duration);
        } else {
          console.error('No audio context available');
        }
      } catch (error) {
        console.error('Error loading audio file:', error);
        alert('Error loading audio file');
      }
    } else {
      alert('Please drop an audio file');
    }
  };

  const handleMuteToggle = () => {
    if (!gainNodeRef.current || !audioContext) return;

    const now = audioContext.currentTime;
    const newMuteState = !isMuted;
    const newGainValue = newMuteState ? 0 : volume;
    
    gainNodeRef.current.gain.setValueAtTime(newGainValue, now + 0.01);
    setIsMuted(newMuteState);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (gainNodeRef.current && !isMuted) {
      gainNodeRef.current.gain.value = newVolume;
    }
  };

  const handleManualBPMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualBPM(value);
    
    const newBPM = parseInt(value);
    if (!isNaN(newBPM) && newBPM >= 60 && newBPM <= 200) {
      setBpm(newBPM);
    }
  };

  const draw = () => {
    drawWaveform();
    drawFrequencyBars();
    animationFrameRef.current = requestAnimationFrame(draw);
  };

  const drawWaveform = () => {
    if (!waveformCanvasRef.current || !analyserRef.current) return;

    const canvas = waveformCanvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = 'rgb(200, 200, 200)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
    canvasCtx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * (canvas.height / 2);

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  };

  const drawFrequencyBars = () => {
    if (!frequencyCanvasRef.current || !analyserRef.current) return;

    const canvas = frequencyCanvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate peak
    let currentPeak = 0;
    for (let i = 0; i < bufferLength; i++) {
      currentPeak = Math.max(currentPeak, dataArray[i] / 255);
    }
    setPeak(currentPeak);

    // Update display peak only if it's higher than current display
    const now = performance.now();
    if (now - lastUpdateRef.current > 500 && currentPeak > displayPeak) {
      setDisplayPeak(currentPeak);
      lastUpdateRef.current = now;
    }

    // Draw frequency bars
    canvasCtx.fillStyle = 'rgb(200, 200, 200)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;

      const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#2563eb');
      gradient.addColorStop(1, '#3b82f6');
      
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }
  };

  const startPlayback = async () => {
    if (!audioContext || !audioBufferRef.current || !analyserRef.current || !gainNodeRef.current) {
      return;
    }

    // Ensure context is running
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const now = audioContext.currentTime;
    
    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBufferRef.current;
    sourceNode.loop = true;
    
    // Apply current playback rate
    sourceNode.playbackRate.setValueAtTime(playbackRate, now);
    
    sourceNode.connect(analyserRef.current);
    analyserRef.current.connect(gainNodeRef.current);
    
    sourceNode.start(now + 0.01);
    
    sourceNodeRef.current = sourceNode;

    // Start visualization
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    draw();
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Reset peak display when stopping
    setDisplayPeak(0);
    setPeak(0);

    // Stop visualization
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const handleClearFile = () => {
    // Stop playback if playing
    stopPlayback();
    
    // Clear all refs and state
    audioBufferRef.current = null;
    sourceNodeRef.current = null;
    setAudioFile(null);
    setBpm(null);
    setDuration(null);
    setVolume(1);
    setIsMuted(false);
    setPlaybackRate(1);
    setManualBPM('');
    setPeak(0);
  };

  // Format duration to MM:SS
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className={`h-full p-4 rounded-lg border-2 border-dashed ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      } transition-colors duration-200 flex flex-col ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">
          {title}
        </h2>
        {audioFile && (
          <button
            onClick={handleClearFile}
            className="text-red-500 hover:text-red-600 text-sm p-1"
          >
            ✕
          </button>
        )}
      </div>

      {audioFile ? (
        <div className="flex flex-col gap-3 flex-grow">
          <p className="text-green-600 font-medium text-sm truncate">
            {audioFile.name}
          </p>
          
          <div className="flex flex-col gap-2 text-xs text-gray-500">
            <p>Size: {(audioFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            {duration && <p>Length: {formatDuration(duration)}</p>}
            <div className="flex flex-col gap-1">
              <p>BPM:</p>
              <input
                type="number"
                value={manualBPM || bpm || ''}
                onChange={handleManualBPMChange}
                className="w-12 px-1 py-0.5 border rounded text-xs"
                placeholder={bpm?.toString()}
                min="60"
                max="200"
              />
              <div className="mt-4">
                <p>Peak: {displayPeak ? `${amplitudeToDB(displayPeak).toFixed(1)}dB` : '-∞'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Waveform</p>
              <canvas 
                ref={waveformCanvasRef}
                className="w-full h-24 bg-gray-100 rounded"
                width={300}
                height={96}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Frequency</p>
              <canvas 
                ref={frequencyCanvasRef}
                className="w-full h-24 bg-gray-100 rounded"
                width={300}
                height={96}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-auto">
            <div className="flex flex-col gap-1">
              <button
                onClick={handleMuteToggle}
                className={`p-2 rounded transition-colors flex items-center justify-center ${
                  isMuted 
                    ? 'bg-gray-200 text-gray-600' 
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={onSolo}
                className={`p-2 rounded transition-colors flex items-center justify-center ${
                  isSolo
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                Solo
              </button>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-xs text-gray-500 text-right">
                {Math.round(volume * 100)}%
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow min-h-[400px]">
          <p className="text-gray-700 mb-1">
            Drop audio file here
          </p>
          <p className="text-xs text-gray-500">
            MP3, WAV, etc.
          </p>
        </div>
      )}
    </div>
  );
} 