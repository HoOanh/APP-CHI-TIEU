const SPLASH_CSS = `
@keyframes arcSplashPulse {
  0%, 100% { transform: scale(0.95); opacity: 0.45; }
  50% { transform: scale(1.1); opacity: 0.9; }
}
@keyframes arcSplashOrbit {
  to { transform: rotate(360deg); }
}
@keyframes arcSplashFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-4px); }
}
@keyframes arcSplashBar {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(35%); }
  100% { transform: translateX(220%); }
}
.arc-splash-root {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  width: 100%;
  padding: 24px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 50% 38%, rgba(0, 188, 124, 0.14), transparent 56%),
    linear-gradient(180deg, #f8fcfa 0%, #f1f5f9 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #0f172a;
}
.arc-splash-inline {
  display: grid;
  place-items: center;
  min-height: 65dvh;
  width: 100%;
  padding: 24px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #0f172a;
}
.arc-splash-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 280px;
}
.arc-splash-emblem {
  position: relative;
  display: grid;
  place-items: center;
  width: 132px;
  height: 132px;
}
.arc-splash-halo {
  position: absolute;
  inset: -10px;
  border-radius: 38px;
  background: radial-gradient(circle, rgba(0, 188, 124, 0.24), transparent 70%);
  animation: arcSplashPulse 2.2s ease-in-out infinite;
}
.arc-splash-ring {
  position: absolute;
  inset: -2px;
  border-radius: 32px;
  padding: 2.5px;
  background: conic-gradient(from 0deg, #00bc7c 0deg, #84cc16 90deg, rgba(0, 188, 124, 0.12) 190deg, rgba(0, 188, 124, 0.12) 360deg);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: arcSplashOrbit 1.7s linear infinite;
}
.arc-splash-logo {
  position: relative;
  display: grid;
  place-items: center;
  width: 124px;
  height: 124px;
  padding: 14px;
  box-sizing: border-box;
  border-radius: 30px;
  background: #ffffff;
  box-shadow: 0 20px 40px -18px rgba(0, 169, 112, 0.4), 0 2px 8px rgba(15, 23, 42, 0.06);
}
.arc-splash-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: arcSplashFloat 2.6s ease-in-out infinite;
}
.arc-splash-sub {
  margin: 20px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  line-height: 1.45;
}
.arc-splash-track {
  margin-top: 14px;
  width: 164px;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.arc-splash-bar {
  width: 60px;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #10b981, #00bc7c, #84cc16);
  animation: arcSplashBar 1.35s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .arc-splash-halo, .arc-splash-ring, .arc-splash-logo img, .arc-splash-bar {
    animation: none;
  }
}
`;

export function AppLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={fullScreen ? 'arc-splash-root' : 'arc-splash-inline'} role="status" aria-live="polite">
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      <div className="arc-splash-card">
        <div className="arc-splash-emblem" aria-hidden="true">
          <div className="arc-splash-halo" />
          <div className="arc-splash-ring" />
          <div className="arc-splash-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/arc-irobot.png"
              alt="ARC Irobot"
              width={96}
              height={76}
              decoding="sync"
              fetchPriority="high"
            />
          </div>
        </div>
        <p className="arc-splash-sub">
          {fullScreen ? 'Đang mở ứng dụng…' : 'Đang tải trang…'}
        </p>
        <div className="arc-splash-track" aria-hidden="true">
          <div className="arc-splash-bar" />
        </div>
      </div>
    </div>
  );
}
