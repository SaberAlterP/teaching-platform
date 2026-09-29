// 把按顺序排列的课时切成连续的“模块”分组（相邻且 section 相同的课时归为一组）
export function groupBySection<T extends { section: string }>(items: T[]) {
  const groups: { section: string; items: { item: T; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push({ item, index });
    else groups.push({ section: item.section, items: [{ item, index }] });
  });
  return groups;
}

// 标题以“5-3 ”开头时，把编号拆出来放在方块左上角
export function splitTitle(title: string) {
  const m = title.match(/^(\d+(?:[-.]\d+)+)\s+(.*)$/);
  return m ? { no: m[1], name: m[2] } : { no: "", name: title };
}
