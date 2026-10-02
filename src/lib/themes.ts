// 教师工作台主题：纯 CSS 变量换色（见 globals.css 的 [data-theme=...]），key 为空表示默认
export const THEME_COOKIE = "tp_theme";

export const THEMES = [
  { key: "", name: "经典蓝", swatch: ["#2f6fed", "#eef6ff"] },
  { key: "teal", name: "青绿", swatch: ["#0d9488", "#ecfdf5"] },
  { key: "violet", name: "紫罗兰", swatch: ["#7c3aed", "#f5f0ff"] },
  { key: "sunset", name: "暖橙", swatch: ["#ea580c", "#fff4ec"] },
  { key: "rose", name: "玫红", swatch: ["#e11d48", "#fff0f3"] },
  { key: "dark", name: "夜间", swatch: ["#6c9bff", "#1b2233"] },
] as const;

export const isTheme = (k: string) => THEMES.some((t) => t.key === k);
