"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VoiceVisualizerProps {
  isActive: boolean;
  levels?: number[];
}

function randomBars(): number[] {
  return Array(32)
    .fill(0)
    .map(() => Math.random() * 50 + 4);
}

export default function VoiceVisualizer({
  isActive,
  levels,
}: VoiceVisualizerProps) {
  const [bars, setBars] = useState<number[]>(randomBars);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (levels && levels.length > 0) {
        setBars(levels.map((l) => Math.max(2, l * 60)));
      } else {
        setBars(randomBars());
      }
    }, 80);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, levels]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-16">
      <AnimatePresence>
        {bars.map((height, i) => (
          <motion.div
            key={i}
            className="w-[3px] rounded-full"
            style={{
              background: `linear-gradient(180deg, #39ff14 0%, #0d4f4f 100%)`,
              boxShadow: isActive ? "0 0 4px #39ff1440" : "none",
            }}
            animate={{ height: isActive ? height : 2 }}
            transition={{
              duration: 0.08,
              ease: "easeOut",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
