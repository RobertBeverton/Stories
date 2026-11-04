// data-mount="text-size" on the story page's <fieldset> of three radios
// (sm, md, lg). The size itself is CSS (the radios drive --reading-scale);
// this remembers the choice per device so it carries across stories.
const KEY = "stories-text-size";
const SIZES = ["sm", "md", "lg"];

function remembered() {
  try {
    const value = localStorage.getItem(KEY);
    return SIZES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function mount(el) {
  const radios = [...el.querySelectorAll('input[type="radio"]')];
  const saved = remembered();
  if (saved) {
    for (const radio of radios) radio.checked = radio.value === saved;
  }
  const onChange = (event) => {
    const value = event.target?.value;
    if (!SIZES.includes(value)) return;
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // not remembered, still applied by CSS
    }
  };
  el.addEventListener("change", onChange);
  return () => el.removeEventListener("change", onChange);
}
