import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

export type PrivateMediaClipRepository = {
  listClipsByMerchant(input: { merchantId: string }): Promise<PrivateMediaClipRecord[]>;
  getClipById(input: { clipId: string }): Promise<PrivateMediaClipRecord | null>;
};

export class InMemoryPrivateMediaClipRepository implements PrivateMediaClipRepository {
  private readonly clips: PrivateMediaClipRecord[];

  constructor(clips: PrivateMediaClipRecord[]) {
    this.clips = clips;
  }

  async listClipsByMerchant(input: { merchantId: string }) {
    return this.clips.filter((clip) => clip.merchantId === input.merchantId);
  }

  async getClipById(input: { clipId: string }) {
    return this.clips.find((clip) => clip.id === input.clipId) ?? null;
  }
}

export const fixturePrivateMediaClips: PrivateMediaClipRecord[] = [
  {
    id: "fixture-video-a-entrance",
    merchantId: "demo-merchant-local",
    mediaType: "video",
    status: "ready",
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    orientation: "portrait",
    description: "Project entrance with nearby shops and readable signage.",
    tags: ["project", "entrance", "shops"],
    sceneTags: ["exterior"],
    shotTags: ["wide"],
    bucketName: "fixture-private-bucket",
    cosKey: "merchant-media/demo-merchant-local/clips/fixture-video-a-entrance.mp4",
    thumbCosKey: "merchant-media/demo-merchant-local/thumbs/fixture-video-a-entrance.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "fixture-video-a-lobby",
    merchantId: "demo-merchant-local",
    mediaType: "video",
    status: "ready",
    width: 1080,
    height: 1920,
    durationSeconds: 12,
    orientation: "portrait",
    description: "Verified project lobby detail and shared corridor.",
    tags: ["project", "lobby", "corridor"],
    sceneTags: ["interior"],
    shotTags: ["detail"],
    bucketName: "fixture-private-bucket",
    cosKey: "merchant-media/demo-merchant-local/clips/fixture-video-a-lobby.mp4",
    thumbCosKey: "merchant-media/demo-merchant-local/thumbs/fixture-video-a-lobby.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-14T00:00:00.000Z",
  },
  {
    id: "fixture-photo-a-living-room",
    merchantId: "demo-merchant-local",
    mediaType: "image",
    status: "ready",
    width: 1600,
    height: 900,
    orientation: "landscape",
    description: "Living room with daylight and clean circulation.",
    tags: ["living", "room", "daylight"],
    sceneTags: ["interior"],
    shotTags: ["wide"],
    bucketName: "fixture-private-bucket",
    cosKey: "merchant-media/demo-merchant-local/clips/fixture-photo-a-living-room.jpg",
    thumbCosKey: "merchant-media/demo-merchant-local/thumbs/fixture-photo-a-living-room.jpg",
    mimeType: "image/jpeg",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "fixture-video-b-entrance",
    merchantId: "demo-merchant-other-local",
    mediaType: "video",
    status: "ready",
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    orientation: "portrait",
    description: "Other merchant entrance that must not leak.",
    tags: ["project", "entrance"],
    bucketName: "fixture-private-bucket",
    cosKey: "merchant-media/demo-merchant-other-local/clips/fixture-video-b-entrance.mp4",
    thumbCosKey: "merchant-media/demo-merchant-other-local/thumbs/fixture-video-b-entrance.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "fixture-video-a-tagging-failed",
    merchantId: "demo-merchant-local",
    mediaType: "video",
    status: "tagging_failed",
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    orientation: "portrait",
    description: "Tagging failed clip that must not be returned.",
    tags: ["project", "entrance"],
    bucketName: "fixture-private-bucket",
    cosKey: "merchant-media/demo-merchant-local/clips/fixture-video-a-tagging-failed.mp4",
    thumbCosKey: "merchant-media/demo-merchant-local/thumbs/fixture-video-a-tagging-failed.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
];
