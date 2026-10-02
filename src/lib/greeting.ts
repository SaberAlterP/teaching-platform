// 按北京时间给问候语
export function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false })) % 24;
  return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}
