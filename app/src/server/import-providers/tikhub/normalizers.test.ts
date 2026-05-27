import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTikHubComments,
  normalizeTikHubMaterialItems,
} from "./normalizers.ts";

test("normalizes TikHub detail items as social viral content", () => {
  const [item] = normalizeTikHubMaterialItems({
    platform: "xiaohongshu",
    findMethod: "detail",
    target: "https://www.xiaohongshu.com/explore/abc123?xsec_token=token",
    cacheKey: "test-cache-key",
    limit: 1,
    payload: {
      data: {
        notes: [
          {
            id: "abc123",
            xsecToken: "token",
            noteCard: {
              displayTitle: "庭院通道爆款笔记",
              desc: "庭院通道这样拍更有生活感",
              type: "normal",
              tagList: [{ name: "庭院设计" }],
              user: { nickname: "设计师A" },
              interactInfo: {
                likedCount: "1.2万",
                commentCount: "56",
                collectedCount: "230",
              },
            },
          },
        ],
      },
    },
  });

  assert.ok(item);
  assert.equal(item.sourceType, "detail");
  assert.equal(item.materialType, "article");
  assert.equal(item.title, "庭院通道爆款笔记");
  assert.equal(item.creatorName, "设计师A");
  assert.deepEqual(item.structureSummary.tags, ["庭院设计"]);
  assert.equal(item.engagementSnapshot.likedCount, 12000);
});

test("normalizes Xiaohongshu App note detail payloads", () => {
  const [item] = normalizeTikHubMaterialItems({
    platform: "xiaohongshu",
    findMethod: "detail",
    target: "https://xhslink.com/a/example",
    cacheKey: "test-cache-key",
    limit: 1,
    payload: {
      data: {
        data: [
          {
            note_list: [
              {
                id: "665f95200000000006005624",
                title: "露台花园怎么拍",
                desc: "露台花园这样拍更有松弛感 #庭院设计",
                type: "normal",
                liked_count: "2.3万",
                comments_count: "128",
                collected_count: "340",
                share_info: {
                  link: "https://www.xiaohongshu.com/explore/665f95200000000006005624",
                },
                user: {
                  id: "user-1",
                  nickname: "庭院博主",
                },
                topics: [{ name: "庭院设计" }],
                image_list: [{ url: "https://example.com/cover.jpg" }],
              },
            ],
          },
        ],
      },
    },
  });

  assert.ok(item);
  assert.equal(item.externalItemId, "665f95200000000006005624");
  assert.equal(item.title, "露台花园怎么拍");
  assert.equal(item.creatorName, "庭院博主");
  assert.equal(item.engagementSnapshot.likedCount, 23000);
  assert.equal(item.engagementSnapshot.commentCount, 128);
  assert.equal(item.engagementSnapshot.collectedCount, 340);
  assert.deepEqual(item.structureSummary.tags, ["庭院设计"]);
  assert.equal(item.structureSummary.coverUrl, "https://example.com/cover.jpg");
  assert.deepEqual(item.structureSummary.imageUrls, ["https://example.com/cover.jpg"]);
});

test("normalizes Xiaohongshu App V2 profile note list payloads", () => {
  const [item] = normalizeTikHubMaterialItems({
    platform: "xiaohongshu",
    findMethod: "profile",
    target: "https://www.xiaohongshu.com/user/profile/61b46d790000000010008153",
    cacheKey: "test-cache-key",
    limit: 1,
    payload: {
      data: {
        data: {
          notes: [
            {
              id: "6819a5f9000000002203abcd",
              display_title: "博主主页里的高赞视频",
              desc: "主页内容里的正文",
              type: "video",
              likes: "8.8万",
              comments_count: "321",
              collected_count: "1200",
              share_count: "45",
              view_count: "120万",
              user: { id: "61b46d790000000010008153", nickname: "高赞博主" },
              images_list: [{ url: "https://example.com/profile-cover.jpg" }],
              video_info_v2: {
                media: {
                  stream: {
                    url: "https://example.com/profile-video.mp4",
                  },
                },
              },
            },
          ],
        },
      },
    },
  });

  assert.ok(item);
  assert.equal(item.sourceType, "creator");
  assert.equal(item.materialType, "video");
  assert.equal(item.title, "博主主页里的高赞视频");
  assert.equal(item.creatorName, "高赞博主");
  assert.equal(item.engagementSnapshot.likedCount, 88000);
  assert.equal(item.engagementSnapshot.playCount, 1200000);
  assert.equal(item.structureSummary.coverUrl, "https://example.com/profile-cover.jpg");
  assert.deepEqual(item.structureSummary.imageUrls, ["https://example.com/profile-cover.jpg"]);
  assert.deepEqual(item.structureSummary.videoUrls, ["https://example.com/profile-video.mp4"]);
});

test("normalizes Douyin video media urls for later source item OSS persistence", () => {
  const [item] = normalizeTikHubMaterialItems({
    platform: "douyin",
    findMethod: "detail",
    target: "https://www.douyin.com/video/123456",
    cacheKey: "test-cache-key",
    limit: 1,
    payload: {
      data: {
        aweme_detail: {
          aweme_id: "123456",
          desc: "烧烤店高赞口播",
          author: { nickname: "餐饮老板" },
          statistics: {
            digg_count: 1200,
            comment_count: 34,
            collect_count: 56,
            share_count: 7,
          },
          video: {
            duration: 15000,
            cover: { url_list: ["https://example.com/cover.jpeg"] },
            play_addr: { url_list: ["https://example.com/video.mp4"] },
          },
        },
      },
    },
  });

  assert.ok(item);
  assert.equal(item.materialType, "video");
  assert.equal(item.externalItemId, "123456");
  assert.equal(item.structureSummary.coverUrl, "https://example.com/cover.jpeg");
  assert.deepEqual(item.structureSummary.imageUrls, ["https://example.com/cover.jpeg"]);
  assert.deepEqual(item.structureSummary.videoUrls, ["https://example.com/video.mp4"]);
});

test("normalizes Douyin detail payloads without choosing params-only aweme id objects", () => {
  const [item] = normalizeTikHubMaterialItems({
    platform: "douyin",
    findMethod: "detail",
    target: "https://www.douyin.com/video/123456",
    cacheKey: "test-cache-key",
    limit: 1,
    payload: {
      params: {
        aweme_id: "params-only-id",
      },
      data: {
        aweme_detail: {
          aweme_id: "123456",
          desc: "工业园烧烤夜宵高赞视频",
          author: { nickname: "烧烤摊主" },
          statistics: {
            digg_count: 3200,
            comment_count: 88,
          },
          video: {
            duration: 18000,
            cover: { url_list: ["https://example.com/real-cover.webp"] },
            play_addr_h264: { url_list: ["https://api-play.amemv.com/aweme/v1/play/?video_id=real"] },
          },
        },
      },
    },
  });

  assert.ok(item);
  assert.equal(item.externalItemId, "123456");
  assert.equal(item.title, "工业园烧烤夜宵高赞视频");
  assert.equal(item.creatorName, "烧烤摊主");
  assert.equal(item.structureSummary.coverUrl, "https://example.com/real-cover.webp");
  assert.deepEqual(item.structureSummary.videoUrls, ["https://api-play.amemv.com/aweme/v1/play/?video_id=real"]);
  assert.notEqual(item.externalItemId, "params-only-id");
});

test("normalizes TikHub comment payloads for storage", () => {
  const comments = normalizeTikHubComments({
    platform: "douyin",
    limit: 10,
    payload: {
      data: {
        comments: [
          {
            cid: "comment-1",
            text: "这个空间看起来很适合亲子活动",
            digg_count: 18,
            reply_comment_total: 2,
            user: { nickname: "用户A" },
          },
        ],
      },
    },
  });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].externalCommentId, "comment-1");
  assert.equal(comments[0].authorName, "用户A");
  assert.equal(comments[0].content, "这个空间看起来很适合亲子活动");
  assert.equal(comments[0].likeCount, 18);
  assert.equal(comments[0].replyCount, 2);
});
