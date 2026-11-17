import { useEffect, useState } from 'react';

export function Modal({ title, onClose, children, footer }: { title?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 160); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  return <div className={'overlay' + (closing ? ' closing' : '')} onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="modal" role="dialog">
      <div className="grabber" />
      {title && <div className="modal-head"><h3>{title}</h3><button className="x" onClick={close} aria-label="Закрыть">×</button></div>}
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  </div>;
}
export const Sheet = Modal;
