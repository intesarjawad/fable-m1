import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";

const SUBDL_DL_BASE = "https://dl.subdl.com";

/**
 * Downloads a Subdl subtitle zip, extracts the correct subtitle file
 * (matching episode number if provided), and returns raw text.
 *
 * Query params:
 *   path    — Subdl download path (e.g. /subtitle/3456626-8379478.zip)
 *   episode — Episode number to match inside the zip (e.g. "2" for S01E02)
 */
export async function GET(request: NextRequest) {
  const subtitlePath = request.nextUrl.searchParams.get("path");
  if (!subtitlePath) {
    return NextResponse.json(
      { error: "Missing 'path' parameter" },
      { status: 400 }
    );
  }

  const episodeNumber = request.nextUrl.searchParams.get("episode");
  const downloadUrl = `${SUBDL_DL_BASE}${subtitlePath}`;

  try {
    const response = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Download failed: ${response.status}` },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    const extracted = extractSubtitleFromZip(
      zipBuffer,
      episodeNumber ? parseInt(episodeNumber, 10) : undefined
    );

    if (!extracted) {
      return NextResponse.json(
        { error: "No subtitle file found in archive" },
        { status: 404 }
      );
    }

    return new Response(extracted.content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const SUBTITLE_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa", ".sub"];

interface ExtractedSubtitle {
  content: string;
  format: string;
  fileName: string;
}

interface ZipEntry {
  fileName: string;
  compressionMethod: number;
  fileData: Buffer;
  format: string;
}

/**
 * Extract subtitle files from a zip. If episodeNumber is provided,
 * prefer a file whose name contains the episode pattern (E02, Episode.2, etc).
 * Falls back to first subtitle file if no episode match.
 */
function extractSubtitleFromZip(
  buffer: Buffer,
  episodeNumber?: number
): ExtractedSubtitle | null {
  // First pass: collect all subtitle entries
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer
      .subarray(offset + 30, offset + 30 + fileNameLength)
      .toString("utf-8");

    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataOffset + compressedSize;

    const lowerName = fileName.toLowerCase();
    const isSubtitle = SUBTITLE_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext)
    );

    if (isSubtitle && compressedSize > 0) {
      const extension = lowerName.split(".").pop() || "srt";
      entries.push({
        fileName,
        compressionMethod,
        fileData: buffer.subarray(dataOffset, dataEnd),
        format: extension,
      });
    }

    offset = dataEnd;
  }

  if (entries.length === 0) return null;

  // If episode number provided, find the matching file
  let target: ZipEntry | undefined;

  if (episodeNumber !== undefined) {
    const paddedEp = String(episodeNumber).padStart(2, "0");
    const patterns = [
      new RegExp(`E${paddedEp}[^0-9]`, "i"),  // E02. or E02-
      new RegExp(`E${episodeNumber}[^0-9]`, "i"), // E2.
      new RegExp(`Episode[._ ]?${paddedEp}`, "i"), // Episode.02
      new RegExp(`Episode[._ ]?${episodeNumber}[^0-9]`, "i"), // Episode.2
      new RegExp(`${paddedEp}[^0-9]`), // just 02 (less specific)
    ];

    for (const pattern of patterns) {
      target = entries.find((e) => pattern.test(e.fileName));
      if (target) break;
    }
  }

  // Fall back to first subtitle file
  if (!target) target = entries[0];

  return decompressEntry(target);
}

function decompressEntry(entry: ZipEntry): ExtractedSubtitle | null {
  if (entry.compressionMethod === 0) {
    return {
      content: entry.fileData.toString("utf-8"),
      format: entry.format,
      fileName: entry.fileName,
    };
  } else if (entry.compressionMethod === 8) {
    try {
      const zlib = require("zlib");
      const decompressed = zlib.inflateRawSync(entry.fileData);
      return {
        content: decompressed.toString("utf-8"),
        format: entry.format,
        fileName: entry.fileName,
      };
    } catch {
      return null;
    }
  }
  return null;
}
