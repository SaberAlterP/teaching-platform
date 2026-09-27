import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 不开启原始 HTML，避免 XSS；需要复杂排版请用 HTML 包模块
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-tp ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
