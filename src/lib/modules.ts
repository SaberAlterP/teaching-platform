// 各类模块的数据结构与判分逻辑（前后端共用，不依赖服务器 API）

export type ModuleType = "RICHTEXT" | "MEDIA" | "QUIZ" | "HTML";

export type RichTextData = { markdown: string };

export type MediaData = {
  kind: "image" | "video";
  src: string; // 上传后是 /api/files/<id>，也可以是外部链接
  caption?: string;
};

export type QuestionType = "single" | "multi" | "fill" | "short";
export type Question = {
  id: string;
  type: QuestionType;
  prompt: string; // 支持 Markdown
  options?: string[]; // 单选/多选
  // single: 选项下标；multi: 下标数组；fill: 可接受答案数组（任一匹配即对）；short: 参考答案（仅供批改参考）
  answer?: number | number[] | string[] | string;
  points: number;
  explanation?: string; // 提交后给学生看的解析
};
export type QuizData = {
  questions: Question[];
  allowRetry: boolean; // 是否允许重做
  showAnswers: boolean; // 提交后是否显示正确答案和解析
};

export type HtmlData = {
  assetId: string; // 上传的 HTML 包
  height: number; // iframe 高度（像素）
  scored: boolean; // 是否接收游戏回传的成绩
  maxScore?: number;
  note?: string; // 给学生的说明
};

export type ModuleData = RichTextData | MediaData | QuizData | HtmlData;

export const MODULE_LABELS: Record<ModuleType, string> = {
  RICHTEXT: "图文",
  MEDIA: "图片 / 视频",
  QUIZ: "习题",
  HTML: "互动内容（HTML 包）",
};

export const QUESTION_LABELS: Record<QuestionType, string> = {
  single: "单选",
  multi: "多选",
  fill: "填空",
  short: "简答",
};

export function defaultData(type: ModuleType): ModuleData {
  switch (type) {
    case "RICHTEXT":
      return { markdown: "在这里写教学内容，支持 **Markdown**。" };
    case "MEDIA":
      return { kind: "image", src: "", caption: "" };
    case "QUIZ":
      return { questions: [], allowRetry: true, showAnswers: true };
    case "HTML":
      return { assetId: "", height: 560, scored: false };
  }
}

const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();

// 自动判分。简答题返回 null（待老师批改）。
export function gradeQuestion(q: Question, ans: unknown): number | null {
  switch (q.type) {
    case "single":
      return typeof ans === "number" && ans === q.answer ? q.points : 0;
    case "multi": {
      if (!Array.isArray(ans) || !Array.isArray(q.answer)) return 0;
      const a = [...(ans as number[])].sort().join(",");
      const b = [...(q.answer as number[])].sort().join(",");
      return a === b ? q.points : 0;
    }
    case "fill": {
      if (typeof ans !== "string") return 0;
      const accepted = (Array.isArray(q.answer) ? (q.answer as string[]) : [String(q.answer ?? "")]).filter((x) => norm(x));
      return norm(ans) && accepted.some((x) => norm(x) === norm(ans)) ? q.points : 0;
    }
    case "short":
      return typeof ans === "string" && ans.trim() ? null : 0;
  }
}

export function gradeQuiz(quiz: QuizData, answers: Record<string, unknown>) {
  const itemScores: Record<string, number | null> = {};
  let score = 0;
  let maxScore = 0;
  let needsGrading = false;
  for (const q of quiz.questions) {
    maxScore += q.points;
    const s = gradeQuestion(q, answers[q.id]);
    itemScores[q.id] = s;
    if (s === null) needsGrading = true;
    else score += s;
  }
  return { itemScores, score, maxScore, needsGrading };
}

// 发给学生前去掉答案（未提交时不能让学生在网络请求里看到答案）
export function stripAnswers(quiz: QuizData): QuizData {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({ ...q, answer: undefined, explanation: undefined })),
  };
}
