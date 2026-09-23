export default function Loading() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-mark" />
      <p>업무와 일정을 불러오는 중입니다…</p>
    </div>
  );
}
