import { Mark } from './Mark';

/**
 * The Sovereign Signal endorsement line: a small 🦂 scorpion (the Sovs Macro
 * mark, see Mark.tsx) and "A Sovereign Signal project". The scorpion is
 * aria-hidden; the text stays live for readers and search, and CSS sets it in
 * capitals.
 */
export function Endorsement({ className }: { className?: string }) {
  return (
    <p className={className ? `endorsement ${className}` : 'endorsement'}>
      <Mark className="endorsement-mark" size={14} />
      <span className="endorsement-text">A Sovereign Signal project</span>
    </p>
  );
}
