import { canBrowserDirectPlayHevc } from "@/src/actions/utils";

/**
 * DeviceProfile that Fable POSTs to /Items/{id}/PlaybackInfo.
 *
 * The shape says:
 *   - Direct-play these (browser-native) container+codec combos as static streams.
 *     MKV is intentionally excluded so JF is forced to remux into HLS-fMP4 instead
 *     of trying to direct-serve a container browsers don't decode.
 *   - For everything else, hand back HLS over MP4 with stream-copy
 *     (no codec re-encode) — i.e. remux only. This matches a server policy that
 *     allows remuxing but disallows codec transcoding.
 *
 * HEVC is opted in only when `canBrowserDirectPlayHevc()` confirms the browser
 * actually decodes hvc1/hev1 (Apple devices); otherwise it's elided so JF won't
 * hand back HEVC variants the browser can't play.
 */
export function getDeviceProfile() {
  const hevcOk = canBrowserDirectPlayHevc();
  const directPlayVideoCodecs = hevcOk ? "h264,hevc,vp9,av1" : "h264,vp9,av1";

  return {
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 100_000_000,
    MusicStreamingTranscodingBitrate: 192_000,

    DirectPlayProfiles: [
      {
        Container: "webm",
        Type: "Video",
        VideoCodec: "vp8,vp9,av1",
        AudioCodec: "vorbis,opus",
      },
      {
        Container: "mp4,m4v,mov",
        Type: "Video",
        VideoCodec: directPlayVideoCodecs,
        AudioCodec: "aac,mp3,opus,flac,ac3,eac3",
      },
    ],

    TranscodingProfiles: [
      {
        Container: "mp4",
        Type: "Video",
        Protocol: "hls",
        Context: "Streaming",
        VideoCodec: directPlayVideoCodecs,
        AudioCodec: "aac,mp3,ac3,eac3,opus,flac",
        MaxAudioChannels: "8",
        BreakOnNonKeyFrames: true,
        MinSegments: 2,
      },
    ],

    CodecProfiles: hevcOk
      ? [
          {
            Type: "Video",
            Codec: "hevc",
            Conditions: [
              {
                Condition: "EqualsAny",
                Property: "VideoProfile",
                Value: "main|main 10",
                IsRequired: false,
              },
              {
                Condition: "LessThanEqual",
                Property: "VideoLevel",
                Value: "153",
                IsRequired: false,
              },
            ],
          },
        ]
      : [],

    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
    ],
  };
}
