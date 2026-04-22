"use client";

import { useEffect, useState } from "react";

interface ModelProviderConfig {
  id: string;
  name: string;
  provider: "deepseek" | "glm" | "custom";
  apiKey: string;
  baseUrl: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

interface ModelConfigStore {
  activeConfigId: string | null;
  configs: ModelProviderConfig[];
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  glm: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  custom: { baseUrl: "", model: "" }
};

function formatTestError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes("401") || lower.includes("authentication") || lower.includes("invalid") || lower.includes("unauthorized")) {
    return "API Key 无效或已失效";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("network")) {
    return "无法连接到模型服务";
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "API Key 无权限访问该模型";
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "模型不存在或 Base URL 配置错误";
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many")) {
    return "请求过于频繁，请稍后重试";
  }
  return "测试失败，请检查配置";
}

export function ModelConfigList() {
  const [store, setStore] = useState<ModelConfigStore>({ activeConfigId: null, configs: [] });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [formTestResult, setFormTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState<"deepseek" | "glm" | "custom">("deepseek");
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiKeyPlaceholder, setFormApiKeyPlaceholder] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState(PROVIDER_DEFAULTS.deepseek.baseUrl);
  const [formModel, setFormModel] = useState(PROVIDER_DEFAULTS.deepseek.model);
  const [formTesting, setFormTesting] = useState(false);

  const isEditing = editingId !== null;

  useEffect(() => {
    void loadConfigs();
  }, []);

  useEffect(() => {
    if (!isEditing) {
      const defaults = PROVIDER_DEFAULTS[formProvider];
      setFormBaseUrl(defaults.baseUrl);
      setFormModel(defaults.model);
      setFormTestResult(null);
    }
  }, [formProvider, isEditing]);

  async function loadConfigs() {
    setLoading(true);
    try {
      const res = await fetch("/api/model-configs");
      const data = (await res.json()) as ModelConfigStore;
      setStore(data);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(config: ModelProviderConfig) {
    setEditingId(config.id);
    setFormName(config.name);
    setFormProvider(config.provider);
    setFormApiKey("");
    setFormApiKeyPlaceholder(config.apiKey); // 显示脱敏值
    setFormBaseUrl(config.baseUrl);
    setFormModel(config.model);
    setFormTestResult(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormApiKey("");
    setFormApiKeyPlaceholder("");
    setFormProvider("deepseek");
    setFormBaseUrl(PROVIDER_DEFAULTS.deepseek.baseUrl);
    setFormModel(PROVIDER_DEFAULTS.deepseek.model);
    setFormTestResult(null);
  }

  async function handleTestConfig(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/model-configs/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: id })
      });
      const data = await res.json();
      setTestResult({
        id,
        success: data.success,
        message: data.success
          ? `连接成功（${data.latencyMs}ms）`
          : formatTestError(data.error || "")
      });
    } catch {
      setTestResult({ id, success: false, message: "测试请求失败" });
    } finally {
      setTesting(null);
    }
  }

  async function handleTestForm() {
    setFormTesting(true);
    setFormTestResult(null);
    try {
      const res = await fetch("/api/model-configs/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: formApiKey, baseUrl: formBaseUrl, model: formModel })
      });
      const data = await res.json();
      setFormTestResult({
        success: data.success,
        message: data.success
          ? `连接成功（${data.latencyMs}ms）`
          : formatTestError(data.error || "")
      });
    } catch {
      setFormTestResult({ success: false, message: "测试请求失败" });
    } finally {
      setFormTesting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing && editingId) {
        // 编辑模式
        const res = await fetch(`/api/model-configs/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName || `${formProvider} / ${formModel}`,
            provider: formProvider,
            apiKey: formApiKey || undefined, // 空字符串表示保留原值
            baseUrl: formBaseUrl,
            model: formModel
          })
        });
        if (res.ok) {
          closeForm();
          await loadConfigs();
        } else {
          const err = await res.json();
          alert(err.error || "更新失败");
        }
      } else {
        // 新增模式
        const res = await fetch("/api/model-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName || `${formProvider} / ${formModel}`,
            provider: formProvider,
            apiKey: formApiKey,
            baseUrl: formBaseUrl,
            model: formModel
          })
        });
        if (res.ok) {
          closeForm();
          await loadConfigs();
        } else {
          const err = await res.json();
          alert(err.error || "创建失败");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: string) {
    setActivating(id);
    try {
      const res = await fetch(`/api/model-configs/${id}/activate`, { method: "POST" });
      if (res.ok) {
        await loadConfigs();
      } else {
        const err = await res.json();
        alert(err.error || "激活失败");
      }
    } finally {
      setActivating(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定删除配置「${name}」吗？此操作不可恢复。`)) {
      return;
    }
    setDeleting(id);
    try {
      const res = await fetch(`/api/model-configs/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadConfigs();
      } else {
        const err = await res.json();
        alert(err.error || "删除失败");
      }
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <div className="panel p-6 text-sm text-slate-500">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 新增/编辑配置表单 */}
      {showForm && (
        <section className="panel p-5">
          <h3 className="mb-4 text-lg font-semibold text-ink">{isEditing ? "编辑配置" : "新增配置"}</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">名称（可选）</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="自动生成"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Provider</label>
                <select
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value as "deepseek" | "glm" | "custom")}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="glm">GLM</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  API Key {isEditing && <span className="text-slate-400">（不修改则保持原值）</span>}
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => { setFormApiKey(e.target.value); setFormTestResult(null); }}
                  required={!isEditing}
                  placeholder={isEditing && formApiKeyPlaceholder ? formApiKeyPlaceholder : "sk-..."}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                {isEditing && formApiKeyPlaceholder && (
                  <div className="mt-1 text-xs text-slate-400">当前：{formApiKeyPlaceholder}</div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Model *</label>
                <input
                  type="text"
                  value={formModel}
                  onChange={(e) => { setFormModel(e.target.value); setFormTestResult(null); }}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Base URL *</label>
                <input
                  type="text"
                  value={formBaseUrl}
                  onChange={(e) => { setFormBaseUrl(e.target.value); setFormTestResult(null); }}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {formTestResult && (
              <div className={`rounded-xl p-3 text-sm ${formTestResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {formTestResult.message}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => void handleTestForm()}
                  disabled={formTesting || !formApiKey || !formBaseUrl || !formModel}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  {formTesting ? "测试中..." : "测试连接"}
                </button>
              )}
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-ink hover:text-ink"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 配置列表 */}
      <section className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-ink">配置列表</h3>
            <p className="mt-1 text-sm text-slate-500">管理 AI 模型配置，切换当前使用的模型。</p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              新增配置
            </button>
          )}
        </div>

        {store.configs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            暂无配置，请点击"新增配置"添加模型。
          </div>
        ) : (
          <div className="space-y-3">
            {store.configs.map((config) => {
              const isActive = config.id === store.activeConfigId;
              const isTesting = testing === config.id;
              const isDeleting = deleting === config.id;
              const currentTestResult = testResult?.id === config.id ? testResult : null;

              return (
                <div
                  key={config.id}
                  className={`rounded-2xl border p-4 ${isActive ? "border-ink bg-ink/5" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink">{config.name}</span>
                        {isActive && (
                          <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-xs text-white">当前使用中</span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {config.provider} / {config.model}
                      </div>
                    </div>
                    <div className="shrink-0 space-y-1 text-right text-xs text-slate-500">
                      <div>API Key: {config.apiKey}</div>
                      <div>{config.baseUrl}</div>
                    </div>
                  </div>
                  {currentTestResult && (
                    <div className={`mt-3 rounded-lg p-2 text-sm ${currentTestResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {currentTestResult.message}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleTestConfig(config.id)}
                      disabled={isTesting || isDeleting}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-ink hover:text-ink disabled:opacity-50"
                    >
                      {isTesting ? "测试中..." : "测试"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(config)}
                      disabled={isDeleting || isTesting}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-ink hover:text-ink disabled:opacity-50"
                    >
                      编辑
                    </button>
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => void handleActivate(config.id)}
                        disabled={activating === config.id || isDeleting}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-ink hover:text-ink disabled:opacity-50"
                      >
                        {activating === config.id ? "切换中..." : "设为当前"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete(config.id, config.name)}
                      disabled={isDeleting || isTesting}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isDeleting ? "删除中..." : "删除"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
