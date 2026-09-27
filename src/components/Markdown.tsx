import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MdNode = { type: string; value?: string; children?: MdNode[] };

// 图文编辑器在表格单元格里换行会写成 <br>，只把它还原成换行，其余 HTML 仍按文字显示
function remarkBr() {
  const walk = (n: MdNode) => {
    n.children?.forEach((c, i) => {
      if (c.type === "html" && /^<br\s*\/?>$/i.test(c.value ?? "")) n.children![i] = { type: "break" };
      else walk(c);
    });
  };
  return walk;
}

// 不开启原始 HTML，避免 XSS；需要复杂排版请用 HTML 包模块
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-tp ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBr]}>{children}</ReactMarkdown>
    </div>
  );
}
