// ---------- Dark mode toggle ----------
const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme");

if (savedTheme) {
  root.setAttribute("data-theme", savedTheme);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  root.setAttribute("data-theme", "dark");
}

themeToggle.addEventListener("click", () => {
  const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// ---------- Mobile nav toggle ----------
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);
revealEls.forEach((el) => observer.observe(el));

// ---------- Photo carousels ----------
document.querySelectorAll(".carousel").forEach((carousel) => {
  const track = carousel.querySelector(".carousel-track");
  const slides = carousel.querySelectorAll(".carousel-track img");
  const dots = carousel.querySelectorAll(".dot");
  let index = 0;

  const goToNext = () => {
    index = (index + 1) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  };

  carousel.addEventListener("click", goToNext);
  carousel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToNext();
    }
  });
});

// ---------- Course marquee ----------
const courseMarquee = document.getElementById("courseMarquee");
const courseTrack = document.getElementById("courseTrack");
const marqueePrev = document.getElementById("marqueePrev");
const marqueeNext = document.getElementById("marqueeNext");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (courseMarquee && courseTrack) {
  const BASE_SPEED = 0.35; // idle drift, px per frame (skipped if reduced motion)
  const BOOST_SCALE = 0.6; // how strongly pointer movement adds speed
  const MAX_BOOST = 8; // px per frame cap from pointer movement
  const BOOST_DECAY = 0.92; // decay per frame back to idle speed
  const CLICK_IMPULSE = 18; // px per frame kick from prev/next buttons

  let setWidth = 0;
  let offset = 0;
  let boost = 0;
  let lastX = null;

  const measure = () => {
    setWidth = courseTrack.scrollWidth / 2;
  };
  measure();
  window.addEventListener("resize", measure);

  courseMarquee.addEventListener("pointermove", (e) => {
    if (lastX !== null) {
      const dx = e.clientX - lastX;
      boost = Math.max(Math.min(boost + dx * BOOST_SCALE, MAX_BOOST), -MAX_BOOST);
    }
    lastX = e.clientX;
  });
  courseMarquee.addEventListener("pointerdown", (e) => { lastX = e.clientX; });
  courseMarquee.addEventListener("pointerleave", () => { lastX = null; });

  marqueeNext?.addEventListener("click", () => { boost += CLICK_IMPULSE; });
  marqueePrev?.addEventListener("click", () => { boost -= CLICK_IMPULSE; });

  const tick = () => {
    offset += (reduceMotion ? 0 : BASE_SPEED) + boost;
    boost *= BOOST_DECAY;
    if (setWidth > 0) {
      let wrapped = offset % setWidth;
      if (wrapped < 0) wrapped += setWidth;
      courseTrack.style.transform = `translateX(${wrapped - setWidth}px)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Footer year ----------
document.getElementById("year").textContent = new Date().getFullYear();
