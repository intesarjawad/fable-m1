import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";

const SUBDL_DL_BASE = "https://dl.subdl.com";

/**
 * Downloads a Subdl subtitle zip, extracts the first .srt/.vtt/.ass file,
 * and returns the raw text content. This avoids exposing the zip handling
 * to the client and keeps the flow simple: client gets plain text subtitle.
 */
export async function GET(request: NextRequest) {
  const subtitlePath = request.nextUrl.searchParams.get("path");
  if (!subtitlePath) {
    return NextResponse.json(
      { error: "Missing 'path' parameter" },
      { status: 400 }
    );
  }

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

    // Parse the zip to find subtitle files
    // ZIP format: local file headers start with PK\x03\x04
    const subtitleContent = extractSubtitleFromZip(zipBuffer);

    if (!subtitleContent) {
      return NextResponse.json(
        { error: "No subtitle file found in archive" },
        { status: 404 }
      );
    }

    return new Response(subtitleContent, {
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

/**
 * Minimal zip extraction — finds the first subtitle file and returns its content.
 * Handles stored (no compression) and deflate-compressed entries.
 */
function extractSubtitleFromZip(buffer: Buffer): string | null {
  let offset = 0;

  while (offset < buffer.length - 4) {
    // Look for local file header signature: PK\x03\x04
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
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer
      .subarray(offset + 30, offset + 30 + fileNameLength)
      .toString("utf-8");

    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataOffset + compressedSize;

    // Check if this is a subtitle file
    const lowerName = fileName.toLowerCase();
    const isSubtitle = SUBTITLE_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext)
    );

    if (isSubtitle && compressedSize > 0) {
      const fileData = buffer.subarray(dataOffset, dataEnd);

      if (compressionMethod === 0) {
        // Stored (no compression)
        return fileData.toString("utf-8");
      } else if (compressionMethod === 8) {
        // Deflate — use Node's zlib
        try {
          const zlib = require("zlib");
          const decompressed = zlib.inflateRawSync(fileData);
          return decompressed.toString("utf-8");
        } catch {
          // Try next file if decompression fails
        }
      }
    }

    // Move to next file entry
    offset = dataEnd;
  }

  return null;
}
