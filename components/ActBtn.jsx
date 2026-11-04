'use client';
// A submit button whose name/value reliably reach server actions (the browser submitter value is dropped by the action form handler).
export default function ActBtn({ name = 'act', value, onClick, ...props }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        const f = e.currentTarget.form;
        if (f) {
          let h = f.querySelector(`input[data-actbtn="${name}"]`);
          if (!h) { h = document.createElement('input'); h.type = 'hidden'; h.name = name; h.dataset.actbtn = name; f.appendChild(h); }
          h.value = value;
        }
        onClick?.(e);
      }}
    />
  );
}
