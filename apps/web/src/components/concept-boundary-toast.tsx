interface ConceptBoundaryToastProps {
  message: string | null;
  onClose: () => void;
}

export function ConceptBoundaryToast({
  message,
  onClose,
}: ConceptBoundaryToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="conceptBoundaryToast" role="status" aria-live="polite">
      <span className="conceptBoundaryMark" aria-hidden="true">概念</span>
      <p>{message}</p>
      <button type="button" aria-label="关闭提示" onClick={onClose}>×</button>
    </div>
  );
}
