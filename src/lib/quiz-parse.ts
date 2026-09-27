// 把纯文本题目批量转成题目数据，方便从 Word、AI 对话里直接粘贴。
// 格式（题与题之间空一行）：
//   1. 公路运输最主要的优势是？
//   A. 运量大
//   B. 门到门、灵活
//   答案：B
//   分值：2
//   解析：公路运输可以实现门到门……
// 多选题答案写多个字母（答案：AC）；没有选项但有答案的是填空题（多个可接受答案用 | 分隔）；
// 没有答案、或题干以【简答】开头的是简答题（"参考答案："可选）。
import type { Question } from "./modules";

const LETTERS = "ABCDEFGHIJ";

export function parseQuestions(text: string, idGen: () => string): Question[] {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: Question[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let prompt: string[] = [];
    const options: string[] = [];
    let answer = "";
    let ref = "";
    let points = 0;
    let explanation = "";
    let forceShort = false;
    for (const line of lines) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^([A-J])[.．、)）]\s*(.+)$/))) options.push(m[2]);
      else if ((m = line.match(/^(?:正确)?答案[:：]\s*(.*)$/))) answer = m[1].trim();
      else if ((m = line.match(/^参考答案[:：]\s*(.*)$/))) ref = m[1].trim();
      else if ((m = line.match(/^分值[:：]\s*(\d+(?:\.\d+)?)/))) points = parseFloat(m[1]);
      else if ((m = line.match(/^解析[:：]\s*(.*)$/))) explanation = m[1].trim();
      else if (!options.length && !answer) prompt.push(line);
    }
    if (!prompt.length) continue;
    prompt = prompt.map((l, i) => (i === 0 ? l.replace(/^\d+[.．、)）]\s*/, "") : l));
    let p = prompt.join("\n");
    if (/^【简答】/.test(p)) { forceShort = true; p = p.replace(/^【简答】\s*/, ""); }
    // 题干里的【单选】【多选】【填空】标记去掉
    p = p.replace(/^【(单选|多选|填空)】\s*/, "");

    const id = idGen();
    if (!forceShort && options.length >= 2) {
      const letters = answer.toUpperCase().replace(/[^A-J]/g, "").split("");
      const idx = [...new Set(letters.map((l) => LETTERS.indexOf(l)).filter((i) => i >= 0 && i < options.length))];
      if (idx.length > 1) out.push({ id, type: "multi", prompt: p, options, answer: idx.sort(), points: points || 3, explanation });
      else out.push({ id, type: "single", prompt: p, options, answer: idx[0] ?? 0, points: points || 2, explanation });
    } else if (!forceShort && answer) {
      out.push({ id, type: "fill", prompt: p, answer: answer.split(/[|｜]/).map((s) => s.trim()).filter(Boolean), points: points || 2, explanation });
    } else {
      out.push({ id, type: "short", prompt: p, answer: ref || answer, points: points || 5, explanation });
    }
  }
  return out;
}
