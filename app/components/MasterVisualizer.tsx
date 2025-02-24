'use client'

import { useRef, useEffect, useCallback } from 'react';

interface MasterVisualizerProps {
  analyser: AnalyserNode | null;
}

export default function MasterVisualizer({ analyser }: MasterVisualizerProps) {
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const drawWaveform = useCallback(() => {
    if (!analyser || !waveformCanvasRef.current) return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = 'rgb(200, 200, 200)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgb(0, 0, 0)';
    ctx.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }, [analyser]);

  const drawFrequencyBars = useCallback(() => {
    if (!analyser || !frequencyCanvasRef.current) return;
    const canvas = frequencyCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = 'rgb(200, 200, 200)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i] / 2;

      ctx.fillStyle = `rgb(${barHeight + 100},50,50)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }
  }, [analyser]);

  const draw = useCallback(() => {
    drawWaveform();
    drawFrequencyBars();
    animationFrameRef.current = requestAnimationFrame(draw);
  }, [drawWaveform, drawFrequencyBars]);

  useEffect(() => {
    if (analyser) {
      draw();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, draw]);

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