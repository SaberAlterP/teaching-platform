"use client";
import { useFormStatus } from "react-dom";

// 放在 <form action=...> 里：提交后立刻变灰并显示等待光标，服务器处理期间不会“点了没反应”
export function PendingButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className} transition ${pending ? "cursor-wait opacity-60" : ""}`}>
      {children}
    </button>
  );
}
