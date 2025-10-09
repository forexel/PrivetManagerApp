import CloseIcon from '../../assets/icons/close.svg?react';

export function CloseFloating({ onClick, className }: { onClick?:()=>void; className?:string }) {
  return (
    <button
      type="button"
      aria-label="Закрыть"
      className={`close-floating ${className ?? ''}`}
      onClick={onClick}
    >
      <CloseIcon className="close-floating-icon" />
    </button>
  );
}