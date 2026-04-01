import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/src/lib/utils";

type MediaType = "movie" | "tv";
type Indexer = "tmdb" | "tvdb";

interface MediaLinkProps {
  id: number | string;
  mediaType: MediaType;
  indexer?: Indexer;
  children: ReactNode;
  className?: string;
}

export function MediaLink({
  id,
  mediaType,
  indexer = "tmdb",
  children,
  className,
}: MediaLinkProps) {
  const basePath = `/details/${id}/${mediaType}`;
  const href = indexer === "tvdb" ? `${basePath}?indexer=tvdb` : basePath;

  return (
    <Link href={href} className={cn(className)}>
      {children}
    </Link>
  );
}
