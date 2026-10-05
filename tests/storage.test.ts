import path from "path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { assetDir, declaredUnzippedSize, guessMime, safeJoin } from "@/lib/storage";

describe("上传文件的路径安全", () => {
  const base = path.resolve("/data/uploads/abc");
  it("正常的相对路径可以", () => {
    expect(safeJoin(base, "index.html")).toBe(path.join(base, "index.html"));
    expect(safeJoin(base, "js/app.js")).toBe(path.join(base, "js/app.js"));
  });
  it("../ 穿越到目录外会被拒绝", () => {
    expect(() => safeJoin(base, "../other/index.html")).toThrow();
    expect(() => safeJoin(base, "../../etc/passwd")).toThrow();
    expect(() => safeJoin(base, "/etc/passwd")).toThrow();
    // 前缀相同的兄弟目录也不行
    expect(() => safeJoin(base, "../abc2/x")).toThrow();
  });
  it("文件 ID 只能是字母数字", () => {
    expect(() => assetDir("abc_123-X")).not.toThrow();
    expect(() => assetDir("../x")).toThrow();
    expect(() => assetDir("a/b")).toThrow();
  });
});

describe("zip 解压前的大小检查", () => {
  it("按 zip 目录记录的解压后大小求和", async () => {
    const z = new JSZip();
    z.file("index.html", "x".repeat(5000));
    z.file("img/a.txt", "y".repeat(300));
    const loaded = await JSZip.loadAsync(await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    expect(declaredUnzippedSize(Object.values(loaded.files))).toBe(5300);
  });
});

describe("guessMime", () => {
  it("按扩展名猜类型", () => {
    expect(guessMime("a.HTML")).toContain("text/html");
    expect(guessMime("model.glb")).toBe("model/gltf-binary");
    expect(guessMime("noext")).toBe("application/octet-stream");
  });
});
