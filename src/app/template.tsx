// 页面切换时整页淡入（只动透明度，不用 transform，避免影响里面的悬浮窗口定位）
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="tp-fade">{children}</div>;
}
