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
