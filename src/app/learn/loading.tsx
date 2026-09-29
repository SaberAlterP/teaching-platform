import { PageLoading } from "@/components/PageLoading";

// 点击方块/链接后，服务器准备页面期间立即显示的占位，避免“点了没反应”
export default function Loading() {
  return <PageLoading />;
}
