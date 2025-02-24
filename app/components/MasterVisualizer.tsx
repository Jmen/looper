'use client'

import { useRef, useEffect, useState } from 'react';
import { amplitudeToDB } from '../utils/audio';

interface MasterVisualizerProps {
  analyser: AnalyserNode | null;
}

export default function MasterVisualizer({ analyser }: MasterVisualizerProps) {
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyCanvasRef = useRef<HTMLCanvasElement>(null);
  const levelMeterCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const peakLevelRef = useRef<number>(0);
  const peakHoldTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [displayPeak, setDisplayPeak] = useState<number>(0);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (analyser) {
      draw();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser]);

  const drawPeakMeter = () => {
    if (!levelMeterCanvasRef.current || !analyser) return;

    const canvas = levelMeterCanvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Calculate RMS and peak values
    let rms = 0;
    let peak = 0;
    for (let i = 0; i < bufferLength; i++) {
      const amplitude = dataArray[i] / 255;
      rms += amplitude * amplitude;
      peak = Math.max(peak, amplitude);
    }
    rms = Math.sqrt(rms / bufferLength);

    // Update peak hold
    if (peak > peakLevelRef.current) {
      peakLevelRef.current = peak;
      if (peakHoldTimeoutRef.current) {
        clearTimeout(peakHoldTimeoutRef.current);
      }
      peakHoldTimeoutRef.current = setTimeout(() => {
        peakLevelRef.current *= 0.97; // Gradual fall
      }, 1000);
    }

    // Update display peak only if it's higher
    const now = performance.now();
    if (now - lastUpdateRef.current > 500 && peak > displayPeak) {
      setDisplayPeak(peak);
      lastUpdateRef.current = now;
    }

    // Draw meter
    const meterWidth = canvas.width;
    const meterHeight = canvas.height;

    // Background
    canvasCtx.fillStyle = 'rgb(200, 200, 200)';
    canvasCtx.fillRect(0, 0, meterWidth, meterHeight);

    // RMS level
    const rmsHeight = rms * meterHeight;
    const gradient = canvasCtx.createLinearGradient(0, meterHeight, 0, 0);
    gradient.addColorStop(0, '#22c55e'); // Green
    gradient.addColorStop(0.6, '#eab308'); // Yellow
    gradient.addColorStop(0.8, '#ef4444'); // Red
    
    canvasCtx.fillStyle = gradient;
    canvasCtx.fillRect(0, meterHeight - rmsHeight, meterWidth, rmsHeight);

    // Peak hold line
    const peakY = meterHeight - (peakLevelRef.current * meterHeight);
    canvasCtx.fillStyle = 'white';
    canvasCtx.fillRect(0, peakY - 2, meterWidth, 2);
  };

  const draw = () => {
    drawWaveform();
    drawFrequencyBars();
    drawPeakMeter();
    animationFrameRef.current = requestAnimationFrame(draw);
  };

  const drawWaveform = () => {
    if (!waveformCanvasRef.current || !analyser) return;

    const canvas = waveformCanvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

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
    if (!frequencyCanvasRef.current || !analyser) return;

    const canvas = frequencyCanvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

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

  // Reset display when analyser changes (usually when stopping)
  useEffect(() => {
    if (!analyser) {
      setDisplayPeak(0);
    }
  }, [analyser]);

  return (
    <div className="flex gap-4 mb-8">
      <div className="flex-1 flex flex-col">
        <p className="text-xs text-gray-500 mb-1">Master Waveform</p>
        <div className="mt-auto h-32">
          <canvas 
            ref={waveformCanvasRef}
            className="w-full h-full bg-gray-100 rounded"
            width={600}
            height={128}
          />
        </div>
      </div>
      <div className="flex-1 flex gap-4">
        <div className="flex-1 flex flex-col">
          <p className="text-xs text-gray-500 mb-1">Master Frequency</p>
          <div className="mt-auto h-32">
            <canvas 
              ref={frequencyCanvasRef}
              className="w-full h-full bg-gray-100 rounded"
              width={600}
              height={128}
            />
          </div>
        </div>
        <div className="w-8 flex flex-col">
          <p className="text-xs text-gray-500 mb-1">Level</p>
          <div className="text-sm font-medium text-gray-700">
            {displayPeak ? 
              `${amplitudeToDB(displayPeak).toFixed(1)}dB` : 
              '-∞'
            }
          </div>
          <div className="mt-auto h-32">
            <canvas 
              ref={levelMeterCanvasRef}
              className="w-full h-full bg-gray-100 rounded"
              width={32}
              height={128}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 