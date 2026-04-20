import type { ImportRequest } from "@/contracts/import";

type ActorConfig = {
  actorId: string;
  buildInput: (request: ImportRequest) => Record<string, unknown>;
};

const defaultMaxComments = 30;
const defaultCreatorPosts = 20;

export function getApifyActorConfig(request: ImportRequest): ActorConfig {
  if (request.platform === "xiaohongshu") {
    return getXiaohongshuActorConfig(request);
  }

  return getDouyinActorConfig(request);
}

function getXiaohongshuActorConfig(request: ImportRequest): ActorConfig {
  if (request.importType === "detail") {
    return {
      actorId: "huggable_quote~xiaohongshu-all-in-one-scraper",
      buildInput: ({ url }) => ({
        mode: "postDetail",
        postUrls: [url],
        maxItems: 1,
      }),
    };
  }

  if (request.importType === "creator") {
    return {
      actorId: "easyapi~rednote-xiaohongshu-user-posts-scraper",
      buildInput: ({ url, options }) => ({
        profileUrls: [url],
        maxItems: options?.maxItems ?? defaultCreatorPosts,
      }),
    };
  }

  return {
    actorId: "easyapi~all-in-one-rednote-xiaohongshu-scraper",
    buildInput: ({ url, options }) => ({
      mode: "comment",
      postUrls: [url],
      maxItems: options?.maxComments ?? defaultMaxComments,
    }),
  };
}

function getDouyinActorConfig(request: ImportRequest): ActorConfig {
  if (request.importType === "detail") {
    return {
      actorId: "easyapi~douyin-video-downloader",
      buildInput: ({ url }) => ({
        links: [url],
      }),
    };
  }

  if (request.importType === "comments") {
    return {
      actorId: "natanielsantos~douyin-comments-scraper",
      buildInput: ({ url, options }) => ({
        postUrls: [url],
        maxCommentsPerPost: options?.maxComments ?? defaultMaxComments,
        maxRepliesPerComment: 1,
      }),
    };
  }

  throw new Error("Douyin creator import is not part of the V0.1-A scaffold.");
}
