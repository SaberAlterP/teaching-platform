import { redirect } from "next/navigation";

// 实际跳转由 middleware 完成，这里兜底
export default function Home() {
  redirect("/login");
}
