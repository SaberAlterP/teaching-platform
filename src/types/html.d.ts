// next.config.ts 里把 .html 配置成按文本导入（AI 技能模板）
declare module "*.html" {
  const content: string;
  export default content;
}
