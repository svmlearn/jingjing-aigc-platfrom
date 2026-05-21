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
