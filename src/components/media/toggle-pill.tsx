"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/src/lib/utils";

interface TogglePillProps {
  options: string[];
  value: string;
  onChange: (selectedValue: string) => void;
  className?: string;
}

interface PillRect {
  x: number;
  width: number;
}

const SPRING_TRANSITION = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export function TogglePill({ options, value, onChange, className }: TogglePillProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillRect, setPillRect] = useState<PillRect>({ x: 0, width: 0 });
  const [containerWidth, setContainerWidth] = useState(0);

  const measureSelectedOption = useCallback(
    (immediate = false) => {
      const selectedIndex = options.indexOf(value);
      if (selectedIndex === -1) return;

      const container = containerRef.current;
      const selectedButton = buttonRefs.current[selectedIndex];
      if (!container || !selectedButton) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();

      setContainerWidth(containerRect.width);
      setPillRect({
        x: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    },
    [options, value]
  );

  // Measure on mount with no animation
  useLayoutEffect(() => {
    measureSelectedOption(true);
  }, []);

  // Re-measure when selected value changes
  useEffect(() => {
    measureSelectedOption();
  }, [measureSelectedOption]);

  // Re-measure on window resize for responsive layouts
  useEffect(() => {
    const handleResize = () => measureSelectedOption();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measureSelectedOption]);

  const handleSelect = (option: string) => {
    onChange(option);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex w-fit items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1 shadow-inner backdrop-blur-md",
        className
      )}
    >
      {/* Sliding indicator — sits below the text buttons */}
      <motion.div
        className="bg-primary pointer-events-none absolute top-1 bottom-1 left-0 z-10 overflow-hidden rounded-lg shadow-lg"
        animate={{ x: pillRect.x, width: pillRect.width }}
        transition={SPRING_TRANSITION}
        aria-hidden="true"
      >
        {/* Counter-translate inner layer so active labels appear stationary */}
        <motion.div
          className="absolute top-0 left-0 flex h-full items-center gap-1"
          animate={{ x: -pillRect.x, width: containerWidth }}
          transition={SPRING_TRANSITION}
          style={{ padding: 4 }}
        >
          {options.map((option) => (
            <span
              key={option}
              className="flex flex-1 items-center justify-center px-4 text-xs font-bold text-primary-foreground whitespace-nowrap"
            >
              {option}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Actual clickable buttons — base layer */}
      {options.map((option, index) => (
        <button
          key={option}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          onClick={() => handleSelect(option)}
          className="text-muted-foreground hover:text-foreground relative z-0 h-7 rounded-lg px-4 text-xs font-bold transition-colors hover:bg-transparent"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
