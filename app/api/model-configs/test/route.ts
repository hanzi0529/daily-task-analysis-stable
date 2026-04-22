import { NextResponse } from "next/server";

import { repositories } from "@/lib/storage/repositories";

const TEST_TIMEOUT_MS = 15000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式不合法" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体不能为空" }, { status: 400 });
  }

  const { apiKey, baseUrl, model, configId } = body as Record<string, unknown>;

  // If configId is provided, look up the config and use its raw API key
  let resolvedApiKey: string | undefined;
  let resolvedBaseUrl: string | undefined;
  let resolvedModel: string | undefined;

  if (typeof configId === "string" && configId.trim()) {
    const store = await repositories.modelConfigs.getRaw();
    const config = store.configs.find((c) => c.id === configId);
    if (!config) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }
    resolvedApiKey = config.apiKey;
    resolvedBaseUrl = config.baseUrl;
    resolvedModel = config.model;
  } else {
    resolvedApiKey = typeof apiKey === "string" ? apiKey : undefined;
    resolvedBaseUrl = typeof baseUrl === "string" ? baseUrl : undefined;
    resolvedModel = typeof model === "string" ? model : undefined;
  }

  if (!resolvedApiKey || !resolvedApiKey.trim()) {
    return NextResponse.json({ error: "apiKey 不能为空" }, { status: 400 });
  }
  if (!resolvedBaseUrl || !resolvedBaseUrl.trim()) {
    return NextResponse.json({ error: "baseUrl 不能为空" }, { status: 400 });
  }
  if (!resolvedModel || !resolvedModel.trim()) {
    return NextResponse.json({ error: "model 不能为空" }, { status: 400 });
  }

  const url = `${resolvedBaseUrl.trim()}/chat/completions`;
  const startedAt = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedApiKey.trim()}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: resolvedModel.trim(),
        max_tokens: 5,
        messages: [{ role: "user", content: "回复 ok" }]
      })
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json({
        success: false,
        latencyMs,
        error: `${response.status} ${errorText.slice(0, 200)}`
      });
    }

    return NextResponse.json({ success: true, latencyMs });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({
        success: false,
        latencyMs,
        error: `连接超时（${TEST_TIMEOUT_MS / 1000}s）`
      });
    }
    return NextResponse.json({
      success: false,
      latencyMs,
      error: error instanceof Error ? error.message : "连接失败"
    });
  } finally {
    clearTimeout(timeout);
  }
}
