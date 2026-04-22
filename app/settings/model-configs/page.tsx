import { ModelConfigList } from "@/components/model-config-list";

export default function ModelConfigsPage() {
  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h1 className="text-2xl font-bold text-ink">模型配置</h1>
        <p className="mt-1 text-sm text-slate-500">
          管理 AI 模型配置，切换当前使用的模型。配置信息仅存储在本地，不会上传到服务器。
        </p>
      </section>
      <ModelConfigList />
    </div>
  );
}
