"use client";

import { motion } from "framer-motion";

interface GlowOrbProps {
  color?: string;
  size?: number;
  x?: string;
  y?: string;
  delay?: number;
}

export function GlowOrb({
  color = "#39ff14",
  size = 200,
  x = "50%",
  y = "50%",
  delay = 0,
}: GlowOrbProps) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      suppressHydrationWarning
      style={{
        width: `${size}px`,
        height: `${size}px`,
        left: x,
        top: y,
        background: `radial-gradient(circle, ${color}20 0%, ${color}05 40%, transparent 70%)`,
        filter: "blur(40px)",
      }}
      animate={{
        scale: [1, 1.3, 1],
        opacity: [0.3, 0.6, 0.3],
        x: [0, 30, -20, 0],
        y: [0, -20, 30, 0],
      }}
      transition={{
        duration: 8,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

interface ScanLineProps {
  direction?: "horizontal" | "vertical";
  color?: string;
}

export function ScanLine({ direction = "horizontal", color = "#39ff14" }: ScanLineProps) {
  const isHorizontal = direction === "horizontal";

  return (
    <motion.div
      className="absolute pointer-events-none"
      suppressHydrationWarning
      style={{
        [isHorizontal ? "width" : "height"]: "100%",
        [isHorizontal ? "height" : "width"]: "1px",
        [isHorizontal ? "left" : "top"]: 0,
        background: `linear-gradient(${isHorizontal ? "90deg" : "180deg"}, transparent, ${color}40, transparent)`,
        boxShadow: `0 0 10px ${color}20`,
      }}
      animate={{
        [isHorizontal ? "top" : "left"]: ["0%", "100%", "0%"],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

export function FloatingDot({
  x,
  y,
  color = "#39ff14",
  delay = 0,
}: {
  x: number;
  y: number;
  color?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className="absolute w-1 h-1 rounded-full pointer-events-none"
      suppressHydrationWarning
      style={{
        left: `${x}%`,
        top: `${y}%`,
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}`,
      }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0.5, 1.5, 0.5],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
