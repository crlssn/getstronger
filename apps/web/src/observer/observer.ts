import {ref, onMounted, onUnmounted, type Ref} from 'vue';

type IntersectionCallback = (entry: IntersectionObserverEntry) => void;

export function useIntersectionObserver(
  callback: IntersectionCallback,
  options: IntersectionObserverInit = {}
): { elementRef: Ref<HTMLElement | null> } {
  const elementRef = ref<HTMLElement | null>(null);
  const observer = ref<IntersectionObserver | null>(null);

  const observe = () => {
    if (elementRef.value) {
      observer.value = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback(entry);
          }
        });
      }, options);

      observer.value.observe(elementRef.value);
    }
  };

  const disconnect = () => {
    if (observer.value) {
      observer.value.disconnect();
      observer.value = null;
    }
  };

  onMounted(() => observe());
  onUnmounted(() => disconnect());

  return { elementRef };
}
