import { describe, expect, it } from "vitest";
import { gradeQuiz, stripAnswers, type QuizData } from "@/lib/modules";
import { parseQuestions } from "@/lib/quiz-parse";

const quiz: QuizData = {
  allowRetry: true,
  showAnswers: true,
  questions: [
    { id: "q1", type: "single", prompt: "单选", options: ["A", "B"], answer: 1, points: 2 },
    { id: "q2", type: "multi", prompt: "多选", options: ["A", "B", "C"], answer: [0, 2], points: 3 },
    { id: "q3", type: "fill", prompt: "填空", answer: ["公路", "公路运输"], points: 2 },
    { id: "q4", type: "short", prompt: "简答", answer: "参考", points: 5 },
  ],
};

describe("gradeQuiz", () => {
  it("全对：客观题满分，简答待批改", () => {
    const g = gradeQuiz(quiz, { q1: 1, q2: [2, 0], q3: " 公路 运输 ", q4: "我的回答" });
    expect(g.itemScores).toEqual({ q1: 2, q2: 3, q3: 2, q4: null });
    expect(g.score).toBe(7);
    expect(g.maxScore).toBe(12);
    expect(g.needsGrading).toBe(true);
  });
  it("答错、漏答都是 0 分；简答留空不用批改", () => {
    const g = gradeQuiz(quiz, { q1: 0, q2: [0], q3: "" });
    expect(g.itemScores).toEqual({ q1: 0, q2: 0, q3: 0, q4: 0 });
    expect(g.needsGrading).toBe(false);
  });
  it("乱七八糟的答案类型不会报错", () => {
    const g = gradeQuiz(quiz, { q1: "1", q2: "0,2", q3: 5, q4: {} });
    expect(g.score).toBe(0);
  });
  it("stripAnswers 去掉答案和解析", () => {
    const s = stripAnswers({ ...quiz, questions: [{ ...quiz.questions[0], explanation: "因为" }] });
    expect(s.questions[0].answer).toBeUndefined();
    expect(s.questions[0].explanation).toBeUndefined();
  });
});

describe("parseQuestions", () => {
  let n = 0;
  const id = () => `id${++n}`;
  it("识别单选、多选、填空、简答", () => {
    const qs = parseQuestions(
      `1. 公路运输最主要的优势是？
A. 运量大
B. 门到门
答案：B
分值：4

2. 哪些是运输方式？
A. 公路
B. 吃饭
C. 铁路
答案：AC

3. 最快的运输方式是____
答案：航空|空运

4. 【简答】说说物流的作用`,
      id,
    );
    expect(qs.map((q) => q.type)).toEqual(["single", "multi", "fill", "short"]);
    expect(qs[0]).toMatchObject({ prompt: "公路运输最主要的优势是？", answer: 1, points: 4 });
    expect(qs[1].answer).toEqual([0, 2]);
    expect(qs[2].answer).toEqual(["航空", "空运"]);
    expect(qs[3].prompt).toBe("说说物流的作用");
  });
});
