'use client';
export default function PrintButton({ label }) { return <button className="btn sm" onClick={() => window.print()}>{label}</button>; }
