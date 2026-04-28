type VideoChainTestDraftEnv = {
  NODE_ENV?: string;
  VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED?: string;
};

type VideoChainTestDraftInput = {
  merchantName: string;
  serviceItems: string[];
  defaultCta: string[];
  forbiddenWords: string[];
  now?: string;
};

export function isVideoChainTestDraftEnabled(
  env: VideoChainTestDraftEnv = process.env,
): boolean {
  const explicitFlag = normalizeBooleanFlag(env.VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED);

  if (explicitFlag !== null) {
    return explicitFlag;
  }

  return env.NODE_ENV !== "production";
}

export function buildVideoChainTestDraftFixture(input: VideoChainTestDraftInput) {
  const now = input.now ?? new Date().toISOString();
  const cta = firstNonEmpty(input.defaultCta) ?? "私信咨询或预约体验";
  const service = firstNonEmpty(input.serviceItems) ?? "核心服务";
  const forbiddenWords = input.forbiddenWords.filter(Boolean);
  const title = "视频链路验证占位脚本";
  const scriptText = [
    "链路测试占位脚本：用于验证视频上传、生成、预览和制作修订，不代表真实内容。",
    "",
    "Scene 1 | 00:00-00:05",
    `画面：上传的第一段素材，优先展示${input.merchantName}的真实环境或人物动作。`,
    "台词：这是一条链路测试视频，先验证素材能否进入剪辑任务。",
    "字幕：素材上传测试",
    "",
    "Scene 2 | 00:05-00:18",
    `画面：上传的第二段素材，展示${service}相关细节。`,
    "台词：这一段用于验证 worker 能否读取脚本、素材和剪辑指令。",
    "字幕：生成任务测试",
    "",
    "Scene 3 | 00:18-00:35",
    "画面：上传的第三段素材或任意可用补位镜头。",
    `台词：完成后继续发起制作修订，验证版本回写和预览更新。${cta}`,
    "字幕：制作修订测试",
  ].join("\n");

  return {
    sourceItem: {
      platform: "douyin" as const,
      title,
      scriptText,
      tracePayload: {
        test_mode: "video_chain_bypass_script",
        created_at: now,
        purpose: "validate_video_upload_generation_revision_chain",
      },
    },
    draft: {
      workingTitle: title,
      rewriteGoal: "绕过脚本生成，验证视频上传、生成、预览和制作修订全链路",
      status: "review_pending" as const,
      inputSnapshot: {
        source: "video_workbench_test_entrypoint",
        generationMode: "video_chain_test_bypass",
        scriptBypass: true,
        createdAt: now,
        merchantName: input.merchantName,
        serviceItems: input.serviceItems,
        forbiddenWords,
      },
      commentInsights: {
        testMode: "video_chain_bypass_script",
        validationTargets: [
          "media_upload",
          "video_edit_job_creation",
          "worker_generation",
          "preview_result",
          "production_revision",
        ],
      },
    },
    variant: {
      platform: "douyin" as const,
      variantType: "video_script" as const,
      title,
      scriptText,
      hashtags: ["视频链路测试", "素材上传测试"],
      ctaText: cta,
      reviewStatus: "approved" as const,
      productionScenes: [
        {
          sceneNo: 1,
          timeRange: "00:00-00:05",
          shotRequirement: "使用任意第一段素材，验证素材能成功上传并绑定到草稿。",
          visual: `${input.merchantName}真实环境、人物动作或任意可用测试素材。`,
          voiceover: "这是一条链路测试视频，先验证素材能否进入剪辑任务。",
          subtitle: "素材上传测试",
          materials: ["第一段测试素材"],
          cameraMovement: "固定机位或轻微推进",
          purpose: "验证上传和素材绑定",
          fallbackShot: "没有匹配素材时使用任意清晰视频或图片补位。",
        },
        {
          sceneNo: 2,
          timeRange: "00:05-00:18",
          shotRequirement: "使用任意第二段素材，验证 worker 可以读取脚本和 input_assets。",
          visual: `${service}相关细节或任意可用测试素材。`,
          voiceover: "这一段用于验证 worker 能否读取脚本、素材和剪辑指令。",
          subtitle: "生成任务测试",
          materials: ["第二段测试素材"],
          cameraMovement: "中景切近景",
          purpose: "验证生成任务",
          fallbackShot: "素材不足时复用第一段素材。",
        },
        {
          sceneNo: 3,
          timeRange: "00:18-00:35",
          shotRequirement: "使用任意第三段素材，验证成片后可以继续发起制作修订。",
          visual: "第三段素材、收尾画面或任意可用补位镜头。",
          voiceover: `完成后继续发起制作修订，验证版本回写和预览更新。${cta}`,
          subtitle: "制作修订测试",
          materials: ["第三段测试素材"],
          cameraMovement: "固定机位",
          purpose: "验证制作修订",
          fallbackShot: "没有第三段素材时使用任意补位镜头。",
        },
      ],
    },
  };
}

function normalizeBooleanFlag(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function firstNonEmpty(values: string[]) {
  return values.find((value) => value.trim().length > 0)?.trim() ?? null;
}
