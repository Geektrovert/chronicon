import { DateTime, Effect, Exit, Schedule, Stream } from "effect";
import { ClientError } from "../errors";

const collapsedStorageKey = "chronicon.sidebar.collapsed";
const widthStorageKey = "chronicon.sidebar.width";

export const sidebarSizes = { default: 288, min: 240, max: 480, rail: 60, viewportFraction: 0.45 };
export type SidebarLayout = { collapsed: boolean; width: number };
export const defaultSidebarLayout: SidebarLayout = {
  collapsed: false,
  width: sidebarSizes.default,
};

export const loadSidebarLayout = Effect.try({
  try: () => {
    const width = Number(localStorage.getItem(widthStorageKey));
    return {
      collapsed: localStorage.getItem(collapsedStorageKey) === "true",
      width:
        Number.isFinite(width) && width >= sidebarSizes.min && width <= sidebarSizes.max
          ? width
          : sidebarSizes.default,
    };
  },
  catch: () => new ClientError({ message: "Sidebar preference could not be loaded." }),
});

export const saveSidebarLayout = ({ collapsed, width }: SidebarLayout) =>
  Effect.try({
    try: () => {
      localStorage.setItem(collapsedStorageKey, String(collapsed));
      localStorage.setItem(widthStorageKey, String(width));
    },
    catch: () => new ClientError({ message: "Sidebar preference could not be saved." }),
  });

export const watchSidebarTime = (onTick: (now: DateTime.Utc) => void) =>
  DateTime.now.pipe(
    Effect.flatMap((now) => Effect.sync(() => onTick(now))),
    Effect.repeat(Schedule.spaced("1 minute")),
  );

export const watchSidebarViewport = (onChange: (mobile: boolean, maximumWidth: number) => void) =>
  Effect.gen(function* () {
    const viewport = yield* Effect.sync(() => window.matchMedia("(max-width: 820px)"));
    const update = Effect.sync(() =>
      onChange(
        viewport.matches,
        Math.max(
          sidebarSizes.min,
          Math.min(sidebarSizes.max, innerWidth * sidebarSizes.viewportFraction),
        ),
      ),
    );
    yield* update;
    yield* Stream.fromEventListener(window, "resize").pipe(Stream.runForEach(() => update));
  });

export function sidebarLayoutFromKey(
  key: string,
  layout: SidebarLayout,
  maximumWidth: number,
  direction: "ltr" | "rtl",
  shiftKey: boolean,
): SidebarLayout | undefined {
  if (key === "Enter") return { ...layout, collapsed: !layout.collapsed };
  if (key === "Home") return shiftKey ? defaultSidebarLayout : { ...layout, collapsed: true };
  if (key === "End") return { collapsed: false, width: maximumWidth };
  if (key !== "ArrowLeft" && key !== "ArrowRight") return;
  const expanding = (key === "ArrowRight") === (direction === "ltr");
  if (layout.collapsed) return expanding ? { collapsed: false, width: sidebarSizes.min } : layout;
  const step = shiftKey ? 48 : 16;
  const width = Math.min(layout.width, maximumWidth) + (expanding ? step : -step);
  return width < sidebarSizes.min
    ? { ...layout, collapsed: true }
    : { collapsed: false, width: Math.min(width, maximumWidth) };
}

export const resizeSidebar = Effect.fn("Client.resizeSidebar")(function* (
  handle: HTMLElement,
  pointer: PointerEvent,
  initial: SidebarLayout,
  maximumWidth: number,
  onChange: (layout: SidebarLayout) => void,
) {
  const frame = handle.closest<HTMLElement>(".workspace");
  if (!frame) return initial;
  const direction = getComputedStyle(handle).direction === "rtl" ? -1 : 1;
  const startWidth = initial.collapsed ? sidebarSizes.rail : Math.min(initial.width, maximumWidth);
  let dragged = false;
  const movedBeyondClick = (event: PointerEvent) =>
    Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) >= 4;
  const layoutAt = (event: PointerEvent): SidebarLayout => {
    const width = startWidth + (event.clientX - pointer.clientX) * direction;
    return width < (sidebarSizes.min + sidebarSizes.rail) / 2
      ? { ...initial, collapsed: true }
      : {
          collapsed: false,
          width: Math.round(Math.max(sidebarSizes.min, Math.min(width, maximumWidth))),
        };
  };

  const listeners = yield* Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller, exit) =>
      Effect.sync(() => {
        controller.abort();
        delete frame.dataset.sidebarResizing;
        if (handle.hasPointerCapture(pointer.pointerId))
          handle.releasePointerCapture(pointer.pointerId);
        if (Exit.isFailure(exit)) onChange(initial);
      }),
  );

  return yield* Effect.callback<SidebarLayout>((resume) => {
    const options = { signal: listeners.signal };
    let finished = false;
    const complete = (layout: SidebarLayout) => {
      if (finished) return;
      finished = true;
      resume(Effect.succeed(layout));
    };
    const cancel = () => complete(initial);
    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId === pointer.pointerId) cancel();
    };

    // Register together before capture: separate streams can miss a fast release.
    handle.addEventListener(
      "pointermove",
      (event) => {
        if (finished || event.pointerId !== pointer.pointerId) return;
        if (!dragged && !movedBeyondClick(event)) return;
        dragged = true;
        frame.dataset.sidebarResizing = "true";
        onChange(layoutAt(event));
      },
      options,
    );
    handle.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== pointer.pointerId) return;
        complete(
          dragged || movedBeyondClick(event)
            ? layoutAt(event)
            : { ...initial, collapsed: !initial.collapsed },
        );
      },
      options,
    );
    handle.addEventListener("pointercancel", cancelPointer, options);
    handle.addEventListener("lostpointercapture", cancelPointer, options);
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") cancel();
      },
      options,
    );
    window.addEventListener("blur", cancel, options);
    window.addEventListener("resize", cancel, options);
    handle.setPointerCapture(pointer.pointerId);
  });
}, Effect.scoped);
