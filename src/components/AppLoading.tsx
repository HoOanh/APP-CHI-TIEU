export function AppLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={fullScreen ? 'grid min-h-dvh place-items-center bg-background' : 'grid min-h-[65dvh] place-items-center'}
      role="status"
    >
      <div className="grid justify-items-center gap-4 px-4 text-center font-[system-ui] text-sm font-medium text-slate-700">
        <span
          aria-hidden="true"
          className="size-9 rounded-full border-4 border-emerald-200 border-t-emerald-700 motion-safe:animate-spin"
        />
        {fullScreen ? 'Đang mở ARC Irobot…' : 'Đang tải trang…'}
      </div>
    </div>
  );
}
