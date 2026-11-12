export function initCarousel(carousel) {
  if (!carousel) return;
  const track = carousel.querySelector(".pcx-slide-track");
  const slides = [...track.children];
  const dots = [...carousel.querySelectorAll(".pcx-slide-dot")];
  if (slides.length < 2) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const count = slides.length;
  let current = 0;
  let pointer = null;
  let dragged = false;
  const makeClone = slide => {
    const copy = slide.cloneNode(true);
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    copy.querySelector("img").removeAttribute("fetchpriority");
    copy.querySelector("img").loading = "lazy";
    return copy;
  };
  track.prepend(makeClone(slides[count - 1]));
  track.append(makeClone(slides[0]));
  carousel.classList.add("is-ready");

  function show(index) {
    current = index;
    slides.forEach((slide, i) => {
      slide.inert = i !== index;
      slide.setAttribute("aria-hidden", String(i !== index));
    });
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    const height = slides[index].getBoundingClientRect().height;
    if (height) track.style.height = height + "px";
  }

  function position(index, motion = true) {
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: motion && !reducedMotion.matches ? "smooth" : "instant",
    });
  }

  function advance(direction) {
    if (!track.clientWidth) return;
    position(current + 1 + direction);
    show((current + direction + count) % count);
  }

  function settle() {
    if (!track.clientWidth || pointer) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index === 0) position(count, false);
    if (index === count + 1) position(1, false);
    show((index + count - 1) % count);
  }

  track.addEventListener("scrollend", settle);
  carousel.querySelector(".pcx-slide-prev").addEventListener("click", () => advance(-1));
  carousel.querySelector(".pcx-slide-next").addEventListener("click", () => advance(1));
  dots.forEach((dot, i) => dot.addEventListener("click", () => {
    position(i + 1);
    show(i);
  }));
  track.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    dragged = false;
    pointer = { id: event.pointerId, x: event.clientX, left: track.scrollLeft };
  });
  track.addEventListener("pointermove", event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    if (!dragged && Math.abs(dx) < 15) return;
    if (!dragged) {
      track.setPointerCapture(event.pointerId);
      track.classList.add("is-dragging");
      dragged = true;
    }
    track.scrollLeft = pointer.left - dx;
  });
  function release(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const moved = pointer.x - event.clientX;
    const previous = Math.round(pointer.left / track.clientWidth);
    track.classList.remove("is-dragging");
    pointer = null;
    if (!dragged) return;
    const target = Math.max(0, Math.min(count + 1, previous + Math.sign(moved)));
    position(target);
    show((target + count - 1) % count);
  }
  track.addEventListener("pointerup", release);
  track.addEventListener("pointercancel", release);
  track.addEventListener("click", event => {
    if (!dragged) return;
    dragged = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  track.addEventListener("dragstart", event => event.preventDefault());

  const resize = new ResizeObserver(() => {
    if (!track.clientWidth) return;
    position(current + 1, false);
    show(current);
  });
  slides.forEach(slide => resize.observe(slide));
  position(1, false);
  show(0);
  setInterval(() => {
    if (!document.hidden && !reducedMotion.matches && !pointer &&
        !carousel.contains(document.activeElement)) advance(1);
  }, 5000);
}
