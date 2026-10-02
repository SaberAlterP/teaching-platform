// 登录页左侧的物流主题插画：纯 SVG + CSS 动画（云飘、飞机飞过、货车驶过、转动的车轮）
export function LoginScene() {
  return (
    <svg viewBox="0 0 520 330" className="h-auto w-full max-w-xl" role="img" aria-label="物流主题插画：仓库、货车和飞机" fill="none" strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <clipPath id="ls-clip"><rect width="520" height="330" rx="24" /></clipPath>
      </defs>
      <g clipPath="url(#ls-clip)">
        <rect width="520" height="330" fill="white" fillOpacity=".12" />
        <circle cx="430" cy="66" r="30" fill="white" fillOpacity=".85" />
        {/* 云 */}
        <g style={{ animation: "tp-cloud 38s linear infinite" }} fill="white" fillOpacity=".7">
          <ellipse cx="40" cy="64" rx="34" ry="11" /><ellipse cx="62" cy="55" rx="20" ry="11" />
        </g>
        <g style={{ animation: "tp-cloud 52s linear -20s infinite" }} fill="white" fillOpacity=".55">
          <ellipse cx="40" cy="130" rx="40" ry="12" /><ellipse cx="70" cy="120" rx="22" ry="12" />
        </g>
        {/* 飞机 */}
        <g style={{ animation: "tp-fly 16s linear infinite" }}>
          <g transform="translate(0 38)" stroke="#1c2433" strokeWidth="2.2">
            <path d="M0 12c0-5 6-8 14-8h34l14-12h8l-6 12h16c6 0 10 3 10 8s-4 8-10 8H14C6 20 0 17 0 12Z" fill="white" />
            <path d="M30 14 10 30h12l22-16ZM30 10 12-6h12l22 16Z" fill="#dbe4f5" />
            <path d="M70 6h4M60 6h4M50 6h4" strokeWidth="2" />
          </g>
        </g>
        {/* 地面与道路 */}
        <rect y="250" width="520" height="80" fill="#1c2433" fillOpacity=".2" />
        <rect y="262" width="520" height="40" fill="#1c2433" fillOpacity=".55" />
        <path d="M0 282h520" stroke="white" strokeWidth="3" strokeDasharray="22 16" strokeOpacity=".75" />
        {/* 仓库 */}
        <g stroke="#1c2433" strokeWidth="2.5">
          <path d="M268 250V158l62-34 62 34v92Z" fill="white" />
          <path d="M268 158l62-34 62 34" fill="#dbe4f5" />
          <rect x="300" y="190" width="60" height="60" fill="#c5d6f5" />
          <path d="M300 206h60M300 222h60M300 238h60" strokeWidth="1.6" />
          <rect x="316" y="146" width="28" height="14" rx="3" fill="white" />
        </g>
        <g stroke="#1c2433" strokeWidth="2.5">
          <path d="M402 250v-70h70v70Z" fill="white" />
          <path d="M402 180l35-22 35 22" fill="#dbe4f5" />
          <rect x="424" y="212" width="26" height="38" fill="#c5d6f5" />
        </g>
        {/* 货物 */}
        <g stroke="#1c2433" strokeWidth="2.2">
          <rect x="204" y="224" width="30" height="26" fill="#ffd9a0" />
          <path d="M204 234h30M219 224v10" />
          <rect x="236" y="234" width="22" height="16" fill="#ffc47a" />
          <rect x="212" y="200" width="22" height="24" fill="#ffe6bf" />
          <path d="M212 210h22" />
        </g>
        {/* 货车 */}
        <g style={{ animation: "tp-drive 11s linear infinite" }}>
          <g transform="translate(0 232)" stroke="#1c2433" strokeWidth="2.5">
            <rect x="0" y="0" width="74" height="42" rx="4" fill="white" />
            <path d="M0 16h74M16 0v42" strokeWidth="1.5" strokeOpacity=".4" />
            <path d="M74 12h22l14 16v14H74Z" fill="#ffd166" />
            <path d="M80 17h14l8 11H80Z" fill="#c5e6ff" strokeWidth="1.8" />
            {[22, 96].map((x) => (
              <g key={x} transform={`translate(${x} 44)`}>
                <circle r="9" fill="#1c2433" stroke="none" />
                <g style={{ animation: "tp-spin .6s linear infinite", transformBox: "fill-box", transformOrigin: "center" }}>
                  <circle r="3.6" fill="#dbe4f5" stroke="none" />
                  <path d="M0-7v14M-7 0h14" stroke="#dbe4f5" strokeWidth="1.5" />
                </g>
              </g>
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
