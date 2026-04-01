"use client";
import { ReactNode, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";

interface MediaCarouselProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  rightContent?: ReactNode;
}

export function MediaCarousel({
  children,
  className,
  title,
  icon,
  rightContent,
}: MediaCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    dragFree: true,
    slidesToScroll: "auto",
  });

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  return (
    <div className={cn("relative", className)}>
      {/* Section header — only rendered when title or rightContent present */}
      {(title || rightContent) && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="text-muted-foreground flex items-center">{icon}</span>
            )}
            {title && (
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            )}
          </div>

          <div className="flex items-center gap-2">
            {rightContent}

            {/* Desktop navigation arrows */}
            <div className="hidden md:flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={scrollPrev}
                className="h-8 w-8 bg-background/10 border-border text-foreground hover:bg-accent"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={scrollNext}
                className="h-8 w-8 bg-background/10 border-border text-foreground hover:bg-accent"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Embla viewport */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex -ml-3">
          {children}
        </div>
      </div>

      {/* Floating navigation for when there's no header (mobile hidden, desktop visible) */}
      {!title && !rightContent && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden items-center pl-1 md:flex">
            <Button
              variant="outline"
              size="icon"
              onClick={scrollPrev}
              className="pointer-events-auto h-8 w-8 bg-background/40 border-border text-foreground hover:bg-accent backdrop-blur-sm"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center pr-1 md:flex">
            <Button
              variant="outline"
              size="icon"
              onClick={scrollNext}
              className="pointer-events-auto h-8 w-8 bg-background/40 border-border text-foreground hover:bg-accent backdrop-blur-sm"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Carousel slide wrapper — use this to wrap each child inside MediaCarousel
 * so Embla can measure slide widths correctly.
 */
export function MediaCarouselSlide({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-[0_0_auto] pl-3", className)}>
      {children}
    </div>
  );
}
