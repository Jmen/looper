'use client'

import { useRef, useEffect } from 'react';

interface MasterVisualizerProps {
  analyser: AnalyserNode | null;
}

export default function MasterVisualizer({ analyser }: MasterVisualizerProps) {
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

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

  const draw = () => {
    drawWaveform();
    drawFrequencyBars();
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
    </div>
  );
} 