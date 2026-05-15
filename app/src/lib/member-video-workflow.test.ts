import assert from "node:assert/strict";
import test from "node:test";

import {
  getMemberVideoDownloadUrl,
  getMemberVideoResultUrl,
  summarizeMemberVideoEditState,
} from "./member-video-workflow.ts";

test("member video workflow waits for at least one uploaded material", () => {
  const state = summarizeMemberVideoEditState({
    uploadedFileCount: 0,
    job: null,
  });

  assert.equal(state.stage, "awaiting_upload");
  assert.equal(state.canStartEdit, false);
  assert.equal(state.canPreviewDownload, false);
});

test("member video workflow can start AI edit after a material is selected", () => {
  const state = summarizeMemberVideoEditState({
    uploadedFileCount: 2,
    job: null,
  });

  assert.equal(state.stage, "ready_to_edit");
  assert.equal(state.canStartEdit, true);
});

test("member video workflow exposes queued and running edit status", () => {
  assert.equal(
    summarizeMemberVideoEditState({
      uploadedFileCount: 2,
      job: {
        status: "queued",
        progressPct: 5,
      },
    }).stage,
    "queued",
  );
  assert.equal(
    summarizeMemberVideoEditState({
      uploadedFileCount: 2,
      job: {
        status: "running",
        progressPct: 47,
      },
    }).stage,
    "editing",
  );
});

test("member video workflow returns preview and download URL after succeeded job", () => {
  const job = {
    status: "succeeded" as const,
    progressPct: 100,
    resultAssets: [
      {
        assetType: "subtitle",
        signedPreviewUrl: "https://example.com/subtitle.srt",
      },
      {
        assetType: "video",
        signedDownloadUrl: "https://example.com/member-video-download.mp4",
        signedPreviewUrl: "https://example.com/member-video.mp4",
      },
    ],
  };
  const state = summarizeMemberVideoEditState({
    uploadedFileCount: 3,
    job,
  });

  assert.equal(getMemberVideoResultUrl(job), "https://example.com/member-video.mp4");
  assert.equal(getMemberVideoDownloadUrl(job), "https://example.com/member-video-download.mp4");
  assert.equal(state.stage, "succeeded");
  assert.equal(state.canPreviewDownload, true);
  assert.equal(state.previewUrl, "https://example.com/member-video.mp4");
  assert.equal(state.downloadUrl, "https://example.com/member-video-download.mp4");
});
