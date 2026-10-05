"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { createClass, deleteClass, deleteStudent, importStudents, moveStudent, renameClass, resetClassPasswords, resetStudentPassword, updateStudent, type StudentRow } from "../actions";

type S = { id: string; username: string; name: string; lastLoginAt: string | null; done: number; classId: string };
type C = { id: string; name: string };
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

export function StudentsClient({ className, classes, students, totalModules }: { className: string; classes: C[]; students: S[]; totalModules: number }) {
  const [clsFilter, setClsFilter] = useState("");
  const [target, setTarget] = useState(classes[0]?.id ?? "");
  const [manage, setManage] = useState(false);
  const [newName, setNewName] = useState("");
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
    // xlsx 库很大（几百 KB），用到时才加载，页面打开更快
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const picked = pickRows(rows);
    if (!picked.length) alert("没有识别到学生。请确认第一行是表头，且包含“学号”和“姓名”两列。");
    setPreview(picked);
    setMode("file");
  }

  function doImport(rows: StudentRow[]) {
    start(async () => {
      const r = await importStudents(rows, target);
      setResult({ message: `成功创建 ${r.created.length} 个账号，初始密码就是各自的学号。`, skipped: r.skipped });
      setPreview([]);
      setPaste("");
      setMode(null);
    });
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["学号", "姓名"], ["2024001", "张三"], ["2024002", "李四"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "学生名单");
    XLSX.writeFile(wb, "学生名单模板.xlsx");
  }

  const list = students.filter((s) => (!clsFilter || s.classId === clsFilter) && (!q || s.username.includes(q) || s.name.includes(q)));
  const pastedRows = mode === "paste" ? parsePasted(paste) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">学生管理</h1>
          <p className="mt-1 text-slate-500">{className} · {classes.length} 个班 · 共 {students.length} 人</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
          <button className="btn-ghost" onClick={downloadTemplate}>下载名单模板</button>
          <button
            className="btn-outline"
            disabled={pending || students.length === 0}
            onClick={() =>
              confirm(`把本班 ${students.length} 名学生的密码全部重置为各自的学号？\n学生自己改过的密码也会被覆盖，已登录的设备会退出。`) &&
              start(async () => {
                const r = await resetClassPasswords();
                setResult({
                  message: `已将 ${r.reset} 名学生的密码重置为学号。` +
                    (r.skipped ? `另有 ${r.skipped} 名学生也在其他老师的课程里，没有重置，请让他们自己修改或联系管理员。` : ""),
                  skipped: [],
                });
              })
            }
          >
            全班密码重置为学号
          </button>
          {classes.length > 1 && (
            <select className="select w-auto py-1.5 text-sm" value={target} onChange={(e) => setTarget(e.target.value)} title="导入到哪个班">
              {classes.map((c) => <option key={c.id} value={c.id}>导入到：{c.name}</option>)}
            </select>
          )}
          <button className="btn-outline" onClick={() => setMode(mode === "paste" ? null : "paste")}>粘贴名单</button>
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>导入 Excel 名单</button>
        </div>
      </div>

      <div className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {[{ id: "", name: "全部" }, ...classes].map((c) => (
            <button
              key={c.id}
              onClick={() => setClsFilter(c.id)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${clsFilter === c.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {c.name} {students.filter((s) => !c.id || s.classId === c.id).length}
            </button>
          ))}
          <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => setManage(!manage)}>{manage ? "收起班级管理" : "班级管理"}</button>
        </div>
        {manage && (
          <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
            {classes.map((c) => (
              <ClassRow key={c.id} c={c} count={students.filter((s) => s.classId === c.id).length} last={classes.length <= 1} onMsg={(m) => setResult({ message: m, skipped: [] })} />
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await createClass(newName);
                  if (r.error) alert(r.error);
                  else setNewName("");
                });
              }}
            >
              <input className="input max-w-xs py-1.5" placeholder="新班级名称，例如：物流2401班" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button className="btn-primary px-3 py-1.5" disabled={pending || !newName.trim()}>新建班级</button>
            </form>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="card p-4 text-sm text-slate-600">
          <div className="mb-1 font-semibold text-slate-800">学生怎么登录</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>导入名单后，系统为每个学生生成账号：<b>账号和初始密码都是学号</b>，不需要再发密码。</li>
            <li>学生扫右侧二维码或打开 <code className="rounded bg-slate-100 px-1">{origin}</code> 登录。</li>
            <li>学生密码还是学号时，登录后页面顶部会提醒他改密码（不强制）；忘记密码时，在下表点“重置密码”即可恢复成学号。</li>
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
              {classes.length > 1 && <th className="px-4 py-2.5 font-medium">班级</th>}
              <th className="px-4 py-2.5 font-medium">学习进度</th>
              <th className="px-4 py-2.5 font-medium">最近登录</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((s) => (
              <StudentRowView key={s.id} s={s} classes={classes} total={totalModules} onReset={() => setResult({ message: `已将 ${s.name} 的密码重置为学号 ${s.username}。`, skipped: [] })} />
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{students.length ? "没有匹配的学生" : "还没有学生，先导入名单吧"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentRowView({ s, classes, total, onReset }: { s: S; classes: C[]; total: number; onReset: () => void }) {
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
            <button className="btn-primary px-2 py-1" onClick={() => start(async () => { const r = await updateStudent(s.id, name); if (r.error) alert(r.error); else setEditing(false); })}>保存</button>
          </span>
        ) : (
          s.name
        )}
      </td>
      {classes.length > 1 && (
        <td className="px-4 py-2.5">
          <select
            className="select w-auto py-1 text-sm"
            value={s.classId}
            disabled={pending}
            onChange={(e) => start(() => moveStudent(s.id, e.target.value))}
          >
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </td>
      )}
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
          onClick={() => confirm(`把 ${s.name} 的密码重置为学号 ${s.username}？\n已登录的设备会退出，学生用学号重新登录。`) && start(async () => { const r = await resetStudentPassword(s.id); if (r.error) alert(r.error); else onReset(); })}
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

function ClassRow({ c, count, last, onMsg }: { c: C; count: number; last: boolean; onMsg: (m: string) => void }) {
  const [name, setName] = useState(c.name);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input max-w-xs py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      <span className="text-slate-400">{count} 人</span>
      <button className="btn-outline px-2 py-1" disabled={pending || !name.trim() || name === c.name} onClick={() => start(async () => { await renameClass(c.id, name); onMsg(`班级已改名为“${name.trim()}”。`); })}>
        改名
      </button>
      <button
        className="btn-danger px-2 py-1"
        disabled={pending || last}
        title={last ? "至少保留一个班级" : count ? "班里还有学生，需先移走" : ""}
        onClick={() => confirm(`删除班级“${c.name}”？`) && start(async () => { const r = await deleteClass(c.id); if (r?.error) alert(r.error); })}
      >
        删除
      </button>
    </div>
  );
}
