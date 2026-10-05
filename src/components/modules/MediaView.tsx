import type { MediaData } from "@/lib/modules";

export function MediaView({ data }: { data: MediaData }) {
  if (!data.src) return <div className="rounded-lg bg-slate-100 p-8 text-center text-slate-400">暂无内容</div>;
  return (
    <figure>
      {data.kind === "video" ? (
        <video src={data.src} controls preload="metadata" className="w-full rounded-lg bg-black" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.src} alt={data.caption ?? ""} className="mx-auto max-h-[70vh] rounded-lg" loading="lazy" decoding="async" />
      )}
      {data.caption && <figcaption className="mt-2 text-center text-sm text-slate-500">{data.caption}</figcaption>}
    </figure>
  );
}
