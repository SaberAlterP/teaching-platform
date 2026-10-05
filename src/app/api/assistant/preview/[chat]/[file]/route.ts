import { getApiUser } from "@/lib/auth";
import { ownChat } from "@/lib/ai/chats";
import { readDraft } from "@/lib/ai/workspace";

// 草稿预览：在 HTML 开头注入一小段脚本，收集运行错误，4 秒后报告给外层页面（AI 助手页），
// 外层再交给服务器，AI 用 html_check 就能知道动画在浏览器里有没有报错。行号保持不变。
const REPORTER = `<script>(function(){var E=[];function add(m){if(E.length<20)E.push(String(m).slice(0,300))}
addEventListener("error",function(e){if(e.target&&e.target!==window&&(e.target.src||e.target.href)){add("资源加载失败："+(e.target.src||e.target.href));return}add((e.message||"脚本错误")+(e.lineno?"（第 "+e.lineno+" 行）":""))},true);
addEventListener("unhandledrejection",function(e){add("未处理的 Promise 错误："+(e.reason&&e.reason.message||e.reason))});
var ce=console.error;console.error=function(){add("console.error："+[].map.call(arguments,function(x){return x&&x.message||String(x)}).join(" "));return ce.apply(console,arguments)};
setTimeout(function(){parent.postMessage({type:"tp:preview-report",errors:E},"*")},4000)})();</script>`.replace(/\n/g, "");

export async function GET(_req: Request, { params }: { params: Promise<{ chat: string; file: string }> }) {
  const u = await getApiUser("TEACHER");
  if (!u) return new Response("无权限", { status: 403 });
  const { chat, file } = await params;
  let html: string;
  try {
    await ownChat(u.id, chat);
    html = await readDraft(chat, decodeURIComponent(file));
  } catch (e) {
    return new Response((e as Error).message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // 放在 <head> 后同一行，不改变后面内容的行号
  const m = /<head[^>]*>/i.exec(html);
  const out = m ? html.slice(0, m.index + m[0].length) + REPORTER + html.slice(m.index + m[0].length) : REPORTER + html;
  return new Response(out, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "sandbox allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
