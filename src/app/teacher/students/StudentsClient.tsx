"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { deleteStudent, importStudents, resetClassPasswords, resetStudentPassword, updateStudent, type StudentRow } from "../actions";

type S = { id: string; username: string; name: string; lastLoginAt: string | null; done: number };
type Result = { message: string; skipped: { username: string; reason: string }[] };

// 识别表头：学号/账号/username，姓名/name，密码/password（可选）
function pickRows(rows: Record<string, unknown>[]): StudentRow[] {
  const find = (r: Record<string, unknown>, keys: string[]) => {
    const k = Object.keys(r).find((x) => keys.some((y) => x.replace(/\s/g, "").toLowerCase().includes(y)));
    return k ? String(r[k] ?? "").trim() : "";
  };
  return rows
    .map((r) => ({
      username: find(r, ["学号", "账号", "用户名", "username", "id"]),
      name: find(r, ["姓名", "名字", "name"]),
      password: find(r, ["密码", "password"]),
    }))
    .filter((r) => r.username);
}

function parsePasted(text: string): StudentRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [username, name, password] = l.split(/[\t,，\s]+/);
      return { username, name: name ?? "", password };
    })
    .filter((r) => r.username && !/学号|账号/.test(r.username));
}

export function StudentsClient({ className, students, totalModules }: { className: string; students: S[]; totalModules: number }) {
  const [mode, setMode] = useState<null | "file" | "paste">(null);
  const [preview, setPreview] = useState<StudentRow[]>([]);
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [qr, setQr] = useState("");
  const [origin, setOrigin] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = `${location.origin}/login`;
    setOrigin(url);
    QRCode.toDataURL(url, { width: 360, margin: 1 }).then(setQr);
  }, []);

  async function onFile(f: File) {
    const wb = XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const picked = pickRows(rows);
    if (!picked.length) alert("没有识别到学生。请确认第一行是表头，且包含“学号”和“姓名”两列。");
    setPreview(picked);
    setMode("file");
  }

  function doImport(rows: StudentRow[]) {
    start(async () => {
      const r = await importStudents(rows);
      setResult({ message: `成功创建 ${r.created.length} 个账号，初始密码就是各自的学号。`, skipped: r.skipped });
      setPreview([]);
      setPaste("");
      setMode(null);
    });
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([["学号", "姓名"], ["2024001", "张三"], ["2024002", "李四"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "学生名单");
    XLSX.writeFile(wb, "学生名单模板.xlsx");
  }

  const list = students.filter((s) => !q || s.username.includes(q) || s.name.includes(q));
  const pastedRows = mode === "paste" ? parsePasted(paste) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">学生管理</h1>
          <p className="mt-1 text-slate-500">{className} · 共 {students.length} 人</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
          <button className="btn-ghost" onClick={downloadTemplate}>下载名单模板</button>
          <button
            className="btn-outline"
            disabled={pending || students.length === 0}
            onClick={() =>
              confirm(`把本班 ${students.length} 名学生的密码全部重置为各自的学号？\n学生自己改过的密码也会被覆盖。`) &&
              start(async () => {
                const n = await resetClassPasswords();
                setResult({ message: `已将 ${n} 名学生的密码重置为学号。`, skipped: [] });
              })
            }
          >
            全班密码重置为学号
          </button>
          <button className="btn-outline" onClick={() => setMode(mode === "paste" ? null : "paste")}>粘贴名单</button>
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>导入 Excel 名单</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="card p-4 text-sm text-slate-600">
          <div className="mb-1 font-semibold text-slate-800">学生怎么登录</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>导入名单后，系统为每个学生生成账号：<b>账号和初始密码都是学号</b>，不需要再发密码。</li>
            <li>学生扫右侧二维码或打开 <code className="rounded bg-slate-100 px-1">{origin}</code> 登录。</li>
            <li>学生登录后可以在右上角“改密码”自行修改；忘记密码时，在下表点“重置密码”即可恢复成学号。</li>
          </ol>
        </div>
        {qr && (
          <div className="card flex flex-col items-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="登录二维码" className="h-36 w-36" />
            <a href={qr} download="登录二维码.png" className="mt-1 text-xs text-brand-600">下载二维码</a>
          </div>
        )}
      </div>

      {mode === "paste" && (
        <div className="card space-y-2 p-4">
          <label className="label">每行一个学生：学号 姓名（空格、逗号或 Tab 分隔；可直接从 Excel 复制两列）</label>
          <textarea className="input min-h-40 font-mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"2024001 张三\n2024002 李四"} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!pastedRows.length || pending} onClick={() => doImport(pastedRows)}>
              {pending ? "导入中…" : `导入 ${pastedRows.length} 人`}
            </button>
            <button className="btn-ghost" onClick={() => setMode(null)}>取消</button>
          </div>
        </div>
      )}

      {mode === "file" && preview.length > 0 && (
        <div className="card space-y-3 p-4">
          <div className="font-semibold">识别到 {preview.length} 名学生，确认导入？</div>
          <div className="max-h-60 overflow-auto rounded border border-slate-100 text-sm">
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {preview.slice(0, 200).map((r, i) => (
                  <tr key={i}><td className="px-3 py-1.5 text-slate-500">{r.username}</td><td className="px-3 py-1.5">{r.name}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pending} onClick={() => doImport(preview)}>{pending ? "导入中…" : "确认导入"}</button>
            <button className="btn-ghost" onClick={() => { setPreview([]); setMode(null); }}>取消</button>
          </div>
        </div>
      )}

      {result && (
        <div className="card space-y-2 border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-3">
            <div className="font-semibold text-emerald-800">{result.message}</div>
            <button className="btn-ghost ml-auto" onClick={() => setResult(null)}>关闭</button>
          </div>
          {result.skipped.length > 0 && (
            <div className="text-sm text-slate-600">
              跳过 {result.skipped.length} 人：{result.skipped.slice(0, 10).map((s) => `${s.username}（${s.reason}）`).join("、")}
              {result.skipped.length > 10 && " …"}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 p-3">
          <input className="input max-w-xs" placeholder="搜索学号或姓名" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">学号</th>
              <th className="px-4 py-2.5 font-medium">姓名</th>
              <th className="px-4 py-2.5 font-medium">学习进度</th>
              <th className="px-4 py-2.5 font-medium">最近登录</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((s) => (
              <StudentRowView key={s.id} s={s} total={totalModules} onReset={() => setResult({ message: `已将 ${s.name} 的密码重置为学号 ${s.username}。`, skipped: [] })} />
            ))}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{students.length ? "没有匹配的学生" : "还没有学生，先导入名单吧"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentRowView({ s, total, onReset }: { s: S; total: number; onReset: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [pending, start] = useTransition();
  const pct = total ? Math.round((s.done / total) * 100) : 0;
  return (
    <tr>
      <td className="px-4 py-2.5 font-mono text-slate-600">{s.username}</td>
      <td className="px-4 py-2.5">
        {editing ? (
          <span className="flex gap-1">
            <input className="input w-32 py-1" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary px-2 py-1" onClick={() => start(async () => { await updateStudent(s.id, name); setEditing(false); })}>保存</button>
          </span>
        ) : (
          s.name
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-500">{pct}%</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-slate-500">
        {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString("zh-CN", { hour12: false }) : <span className="text-slate-300">从未登录</span>}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <button className="btn-ghost px-2 py-1" onClick={() => setEditing(!editing)}>改名</button>
        <button
          className="btn-ghost px-2 py-1"
          disabled={pending}
          onClick={() => confirm(`把 ${s.name} 的密码重置为学号 ${s.username}？`) && start(async () => { await resetStudentPassword(s.id); onReset(); })}
        >
          重置密码
        </button>
        <button
          className="btn-danger px-2 py-1"
          onClick={() => confirm(`删除学生 ${s.name}（${s.username}）？其作答记录会一起删除。`) && start(() => deleteStudent(s.id))}
        >
          删除
        </button>
      </td>
    </tr>
  );
}
