import { useState, useEffect, useRef } from 'react';

export interface Size {
  width: number;
  height: number;
}

/**
 * A hook that observes and reports size changes of a DOM element
 * @returns [ref, size, entry] where:
 * - ref: Ref to attach to the element you want to observe
 * - size: The current size of the element {width, height}
 * - entry: The raw ResizeObserverEntry (if you need more details)
 */
export function useResizeObserver<T extends HTMLElement>(): [
  React.RefObject<T>,
  Size,
  ResizeObserverEntry | null
] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [entry, setEntry] = useState<ResizeObserverEntry | null>(null);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        setSize({ width, height });
        setEntry(entry);
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return [ref, size, entry];
}

export default useResizeObserver; 